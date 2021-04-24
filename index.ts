import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import fetch from 'node-fetch';
import * as redis from 'redis';
import { chunk, sumBy } from 'lodash';
import {
    BoardStateDetails,
    RequestSearchParams,
    MoveDecisionData,
    RunnerParams,
    RunnerState,
    MovesPath,
} from './types';
import {
    budapestDefensePath,
    exchangeCaroKannPath,
    italianBirdAttack,
    italianGamePath,
    knightAttackPath,
    panovAttackPath,
    staffordGambitPath,
} from './openings';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const redisClient = redis.createClient();

// promisified
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);

// Redis
const rGet = promisify(redisClient.get).bind(redisClient);
const rSet = promisify(redisClient.set).bind(redisClient);

// Utils

function wait(millis: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, millis);
    });
}

function percentage(num: number): number {
    return Number((num * 100).toFixed(2));
}

function sansPathToPGN(sansPath: string[]): string {
    const pgn = chunk(sansPath, 2)
        .reduce((res, movesPair, idx) => {
            const moveText = `${idx + 1}. ${movesPair.join(' ')}`;
            return `${res} ${moveText}`;
        }, '')
        .trim();

    return pgn;
}

/* ********************************************** */

init();

async function init() {
    const runnerParams: RunnerParams = {
        startingPath: staffordGambitPath,
        shouldExpand: ({ numGames, cumulativeProbability }) => numGames > 10000 && cumulativeProbability < 90,
        shouldRecord: ({ numGames, whitePercentage, blackPercentage }) =>
            numGames > 10000 && [whitePercentage, blackPercentage].some((percentage) => percentage > 60),
        shouldStop: ({ millis }) => {
            const seconds = millis / 1000;

            if (seconds > 10) {
                console.log('timed out');
                return true;
            }

            return false;
        },
    };

    const { recordedPaths } = await runner(runnerParams);
    const pgns = recordedPaths.filter((path) => path.san).map((path) => sansPathToPGN(path.san!));

    console.log('final result:', pgns);

    if (!pgns.length) return;

    const shouldSaveReplay = await question('Would you like to save your results? (Y/N) ');
    const shouldSave = shouldSaveReplay.toLowerCase() === 'y';

    if (!shouldSave) return;

    const defaultFolderName = getDefaultFolderName();
    const folderName = (await question(`folder name: (${defaultFolderName}) `)) || defaultFolderName;

    await savePGNs(pgns, folderName);
    console.log('results were saved successfully');
    rl.close();
}

function question(q: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(q, (reply) => {
            resolve(reply);
        });
    });
}

function getDefaultFolderName() {
    const date = new Date();
    const folderName = `${date.getUTCDay()}_${date.getUTCMonth()}_${date.getUTCFullYear()}_${date.getUTCHours()}_${date.getUTCMinutes()}_${date.getUTCSeconds()}`;
    return folderName;
}

async function savePGNs(pgns: string[], folderName: string) {
    const savePathBase = path.resolve('/Users', 'user', 'Itamar', 'generated_chess_moves');
    const folderPath = path.resolve(savePathBase, folderName);

    if (!(await exists(folderPath))) {
        await mkdir(folderPath);
    }

    return Promise.all(
        pgns.map((pgn, idx) => {
            const filePath = path.resolve(folderPath, `result_${idx + 1}.pgn`);
            return writeFile(filePath, pgn);
        })
    );
}

async function fetchBoardStateDetails(previousMoves: string[]): Promise<BoardStateDetails> {
    const standardFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR+w+KQkq+-+0+1';
    const fen = standardFen.replace('+', ' ');

    const requestParams: RequestSearchParams = {
        fen,
        play: previousMoves.join(','),
    };

    const cacheKey = JSON.stringify(requestParams);
    const cachedResponse = await rGet(cacheKey);

    if (cachedResponse) {
        console.log('retrieved from cache');
        return JSON.parse(cachedResponse);
    }

    // @ts-ignore
    const urlParams = new URLSearchParams(Object.entries(requestParams));

    const requestInfo = {
        headers: {
            accept: '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
        },
        method: 'GET',
    };

    const url = `https://explorer.lichess.ovh/lichess?${urlParams.toString()}&variant=standard&speeds%5B%5D=classical&speeds%5B%5D=rapid&speeds%5B%5D=blitz&speeds%5B%5D=bullet&ratings%5B%5D=2500&ratings%5B%5D=2200&ratings%5B%5D=2000&ratings%5B%5D=1800&ratings%5B%5D=1600`;

    await wait(1000);

    const res = await fetch(url, requestInfo);

    const { moves, black, white, draws } = (await res.json()) as BoardStateDetails;
    const boardStateDetails: BoardStateDetails = { moves, black, white, draws };

    await rSet(cacheKey, JSON.stringify(boardStateDetails));

    return boardStateDetails;
}

async function runner(params: RunnerParams): Promise<RunnerState> {
    const startTime = new Date().getTime();
    const recordedPaths: MovesPath[] = [];
    let numExpandedMoves = 0;
    let isArtificiallyStopped = false;

    await recurse(params.startingPath);

    return getRunnerState();

    function getRunnerState(): RunnerState {
        return {
            millis: new Date().getTime() - startTime,
            recordedPaths,
            numExpandedMoves,
            isArtificiallyStopped,
        };
    }

    async function recurse(path: MovesPath) {
        if (isArtificiallyStopped) {
            return;
        }

        const runnerState = getRunnerState();
        const shouldStop = params.shouldStop?.(runnerState);

        if (shouldStop) {
            isArtificiallyStopped = true;
            return;
        }

        const boardStateDetails = await fetchBoardStateDetails(path.uci);
        numExpandedMoves++;

        const numBoardStateGames = boardStateDetails.white + boardStateDetails.black + boardStateDetails.draws;

        console.log('path:', path.san);
        console.log('number of games:', numBoardStateGames);

        const movesDecisionData: MoveDecisionData[] = boardStateDetails.moves.reduce((res, move) => {
            const numMoveGames = move.white + move.black + move.draws;
            const movePath: MovesPath = {
                uci: [...path.uci, move.uci],
                san: path.san ? [...path.san, move.san] : undefined,
            };
            const pathLen = movePath.uci.length;
            const probablity = percentage(numMoveGames / numBoardStateGames);

            // TODO: works only if moves are sorted by probability in descending order
            const cumulativeProbability = sumBy(res, (move) => move.probablity);

            const movesDecisionData: MoveDecisionData = {
                path: movePath,
                toMove: pathLen % 2 === 0 ? 'white' : 'black',
                numGames: numMoveGames,
                probablity,
                cumulativeProbability,
                whitePercentage: percentage(move.white / numMoveGames),
                blackPercentage: percentage(move.black / numMoveGames),
                drawPercentage: percentage(move.draws / numMoveGames),
                depth: pathLen,
            };

            return [...res, movesDecisionData];
        }, [] as MoveDecisionData[]);

        for (const moveDecisionData of movesDecisionData) {
            const shouldRecord = params.shouldRecord(moveDecisionData);
            const shouldExpand = params.shouldExpand(moveDecisionData);

            if (shouldRecord) {
                recordedPaths.push(moveDecisionData.path);
            }

            if (shouldExpand) {
                await recurse(moveDecisionData.path);
            }
        }
    }
}

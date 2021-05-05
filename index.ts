import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import fetch from 'node-fetch';
import * as redis from 'redis';
import { chunk, groupBy, partition, sumBy, sortBy } from 'lodash';
import {
    BoardStateDetails,
    RequestSearchParams,
    MoveDecisionData,
    RunnerParams,
    RunnerState,
    MovesPath,
    RecordedPath,
    BoardDBNode,
} from './types';
import {
    budapestDefensePath,
    exchangeCaroKannPath,
    friedLiverAttack,
    italianBirdAttack,
    italianGamePath,
    knightAttackPath,
    panovAttackPath,
    staffordGambitPath,
    staffordQueenPath,
} from './openings';
import { insertBoardToDB } from './graph-db/graph-db';

type Structure = {
    [key: string]: Structure | string;
};

interface StructureOptions {
    consolidateLinearLines: boolean;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const redisClient = redis.createClient();

// promisified
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

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

function addGetter<T extends Object, K extends keyof T>(obj: T, getterKey: K, getter: () => T[K]): T {
    return Object.defineProperty(obj, getterKey, { get: getter });
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

// Config

const shouldConsolidateLinearLines = true;
const savePathBase = path.resolve('saved-results');

// Consts

const terminatedKey = 'terminated';

// ****************************************************************************************************

function structure(
    arrays: string[][],
    { consolidateLinearLines }: StructureOptions = { consolidateLinearLines: shouldConsolidateLinearLines }
): Structure {
    return recurse(arrays, 0, []);

    function recurse(arrays: string[][], arrIdx: number, seq: string[]): Structure {
        const [[terminatedArray], nonTerminatedArrays] = partition(arrays, (arr) => arrIdx > arr.length - 1);
        const groupedByFirst = groupBy(nonTerminatedArrays, (arr) => arr[arrIdx]);

        const groupKeys = Object.keys(groupedByFirst);
        const isSingleGroup = groupKeys.length === 1;
        const shouldContinueSeq = consolidateLinearLines ? isSingleGroup : isSingleGroup && !terminatedArray.length;

        if (shouldContinueSeq) {
            const nextArrays = Object.values(groupedByFirst)[0];
            return recurse(nextArrays, arrIdx + 1, [...seq, groupKeys[0]]);
        }

        const subStructures = Object.entries(groupedByFirst).map(([key, group]) => {
            return recurse(group, arrIdx + 1, [key]);
        });

        const terminatedObj = terminatedArray ? { [terminatedKey]: terminatedArray.join(' ') } : {};
        const mergedSubStructres = subStructures.reduce((res, sub) => ({ ...res, ...sub }), terminatedObj as Structure);

        return seq.length
            ? {
                  [seq.join(' ')]: mergedSubStructres,
              }
            : mergedSubStructres;
    }
}

/* ********************************************** */

init();

async function init() {
    const runnerParams: RunnerParams = {
        startingPath: staffordGambitPath,
        shouldExpand: ({ numGames, depth }) => numGames > 300 && depth < 15,
        shouldRecord: ({ numGames, whitePercentage, blackPercentage }) => {
            return numGames > 300 && [whitePercentage, blackPercentage].some((percentage) => percentage > 85);
        },
        shouldStop: ({ millis }) => {
            const seconds = millis / 1000;

            if (seconds > 60) {
                console.log('timed out');
                return true;
            }

            return false;
        },
    };

    const { recordedPaths } = await runner(runnerParams);
    const recordedPathsToSave = recordedPaths.map(({ path }) => path).filter((path) => path.san);
    const pgns = recordedPathsToSave.map((path) => sansPathToPGN(path.san!));

    console.log('results:', pgns);

    if (!recordedPathsToSave.length) return;

    const shouldSaveReplay = await question('Would you like to save your results? (Y/N) ');
    const shouldSave = shouldSaveReplay.toLowerCase() === 'y';

    if (!shouldSave) return;

    const defaultFolderName = getDefaultFolderName();
    const folderName = (await question(`folder name: (${defaultFolderName}) `)) || defaultFolderName;

    await saveRecordedPaths(recordedPathsToSave, folderName);
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

async function saveRecordedPaths(recordedPaths: MovesPath[], folderName: string) {
    const folderPath = path.resolve(savePathBase, folderName);

    await mkdir(folderPath, { recursive: true });

    const sans = recordedPaths.map((path) => path.san!);
    const structuredSans = structure(sans);
    const filteredSans = flattenStructure(structuredSans);
    const sortedSans = sortBy(filteredSans, (san) => san.join(' '));

    console.log('sorted sans:', sortedSans);

    await savePGNSFlat(sortedSans, folderPath);
    await savePGNStudy(sortedSans, folderPath);
    await savePGNsStructured(structuredSans, folderPath);
}

function flattenStructure(structure: Structure): string[][] {
    const terminated = structure[terminatedKey] as string | null;
    const terminatedPaths = terminated ? [terminated.split(' ')] : [];

    const subPaths = Object.entries(structure)
        .filter(([key]) => key !== terminatedKey)
        .flatMap(([, subStructure]) => flattenStructure(subStructure as Structure));

    return [...terminatedPaths, ...subPaths];
}

async function savePGNsStructured(structuredSans: Structure, folderPath: string): Promise<void> {
    const structuredPGNSBasePath = path.resolve(folderPath, 'structured');

    return recurse(structuredSans, structuredPGNSBasePath);

    async function recurse(structure: Structure, folderPath: string) {
        await mkdir(folderPath, { recursive: true });

        const terminated = structure[terminatedKey] as string | null;
        const terminatedPGN = terminated ? sansPathToPGN(terminated.split(' ')) : null;

        if (terminatedPGN) {
            const filePath = path.resolve(folderPath, 'line.pgn');
            await writeFile(filePath, terminatedPGN);
        }

        const subStructureEntries = Object.entries(structure).filter(([key]) => key !== terminatedKey) as [
            string,
            Structure
        ][];

        for (const [key, subStructure] of subStructureEntries) {
            const nextFolderPath = path.resolve(folderPath, key);
            await recurse(subStructure, nextFolderPath);
        }
    }
}

async function savePGNStudy(sans: string[][], folderPath: string) {
    const pgns = sans.map(sansPathToPGN).map((pgn) => `[]\n\n${pgn}`);
    const content = pgns.join('\n\n\n');

    const filePath = path.resolve(folderPath, 'study.pgn');
    await writeFile(filePath, content);
}

async function savePGNSFlat(sans: string[][], folderPath: string) {
    const pgns = sans.map(sansPathToPGN);

    const flatFolderPath = path.resolve(folderPath, 'flat');

    await mkdir(flatFolderPath, { recursive: true });

    return Promise.all(
        pgns.map((pgn, idx) => {
            const filePath = path.resolve(flatFolderPath, `line_${idx + 1}.pgn`);
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

    // @ts-ignore
    const urlParams = new URLSearchParams(Object.entries(requestParams));

    const url = `https://explorer.lichess.ovh/lichess?${urlParams.toString()}&variant=standard&speeds%5B%5D=classical&speeds%5B%5D=rapid&speeds%5B%5D=blitz&speeds%5B%5D=bullet&ratings%5B%5D=2500&ratings%5B%5D=2200&ratings%5B%5D=2000&ratings%5B%5D=1800&ratings%5B%5D=1600`;
    const cacheKey = url;
    const cachedResponse = await rGet(cacheKey);

    if (cachedResponse) {
        console.log('retrieved from cache');
        return JSON.parse(cachedResponse);
    }

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

    // Wait 1 second before every api request
    await wait(1000);

    // Send api request
    const res = await fetch(url, requestInfo);

    const { moves, black, white, draws } = (await res.json()) as BoardStateDetails;
    const boardStateDetails: BoardStateDetails = { moves, black, white, draws };

    await rSet(cacheKey, JSON.stringify(boardStateDetails));

    return boardStateDetails;
}

async function runner(params: RunnerParams): Promise<RunnerState> {
    const startTime = new Date().getTime();
    const recordedPaths: RecordedPath[] = [];
    let numExpandedMoves = 0;
    let isArtificiallyStopped = false;

    const startingPathLen = params.startingPath.uci.length;

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

    async function recurse(path: MovesPath, lastMoveDecisionData?: MoveDecisionData) {
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
        const boardDbNode: BoardDBNode = {
            uci: path.uci.join(' '),
            black: boardStateDetails.black,
            white: boardStateDetails.white,
            draws: boardStateDetails.draws,
        };

        await insertBoardToDB(boardDbNode);

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

            const moveDecisionData: MoveDecisionData = {
                id: movePath.uci.join(' '),
                path: movePath,
                toMove: pathLen % 2 === 0 ? 'white' : 'black',
                numGames: numMoveGames,
                probablity,
                cumulativeProbability,
                whitePercentage: percentage(move.white / numMoveGames),
                blackPercentage: percentage(move.black / numMoveGames),
                drawPercentage: percentage(move.draws / numMoveGames),
                depth: pathLen - startingPathLen,
                prevMoveData: lastMoveDecisionData,
            };

            return [...res, moveDecisionData];
        }, [] as MoveDecisionData[]);

        // add alternative moves data to each move decision data
        movesDecisionData.forEach((moveDecisionData) => {
            addGetter(moveDecisionData, 'alternativeMovesData', () =>
                movesDecisionData.filter((m) => m.id !== moveDecisionData.id)
            );
        });

        for (const moveDecisionData of movesDecisionData) {
            const shouldRecord = params.shouldRecord(moveDecisionData);
            const shouldExpand = params.shouldExpand(moveDecisionData);

            if (shouldRecord) {
                console.log('recorded path:', moveDecisionData.path.san);
                const recordedPath: RecordedPath = {
                    path: moveDecisionData.path,
                    decisionData: moveDecisionData,
                };
                recordedPaths.push(recordedPath);
            }

            if (shouldExpand) {
                await recurse(moveDecisionData.path, moveDecisionData);
            }
        }
    }
}

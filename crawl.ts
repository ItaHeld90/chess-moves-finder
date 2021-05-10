import * as redis from 'redis';
import { initial, last, sumBy } from 'lodash';
import fetch from 'node-fetch';
import { promisify } from 'util';
import { initGraphDB, insertBoardToDB, insertMoveToDB } from './graph-db/graph-db';
import {
    RunnerParams,
    RunnerState,
    RecordedPath,
    MovesPath,
    MoveDecisionData,
    BoardDBNode,
    BoardStateDetails,
    MoveDBNode,
    RequestSearchParams,
    MoveDetails,
} from './types';
import { percentage, addGetter, wait } from './helper-utils';

// Redis
const redisClient = redis.createClient();
const rGet = promisify(redisClient.get).bind(redisClient);
const rSet = promisify(redisClient.set).bind(redisClient);

const updateGraphDB = true;

export async function runner(params: RunnerParams): Promise<RunnerState> {
    if (updateGraphDB) {
        await initGraphDB();
    }

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

        if (updateGraphDB) {
            await saveToGraph(path, boardStateDetails, lastMoveDecisionData);
        }

        numExpandedMoves++;

        const numBoardStateGames = boardStateDetails.white + boardStateDetails.black + boardStateDetails.draws;

        console.log('path:', path.san);
        console.log('number of games:', numBoardStateGames);

        // the probabilty for a move is calculated relative to the total sum of number of games for sibling moves
        const totalNumGamesForMoves = sumBy(boardStateDetails.moves, getNumGamesForMove);

        const movesDecisionData: MoveDecisionData[] = boardStateDetails.moves.reduce((res, move) => {
            const numMoveGames = getNumGamesForMove(move);
            const movePath: MovesPath = {
                uci: [...path.uci, move.uci],
                san: path.san ? [...path.san, move.san] : undefined,
            };
            const pathLen = movePath.uci.length;
            const probablity = percentage(numMoveGames / totalNumGamesForMoves);

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

function getNumGamesForMove(move: MoveDetails): number {
    return move.white + move.black + move.draws;
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

async function saveToGraph(
    path: MovesPath,
    boardStateDetails: BoardStateDetails,
    lastMoveDecisionData?: MoveDecisionData
) {
    const boardDbNode: BoardDBNode = {
        uci: path.uci.join(' '),
        san: path.san?.join(' ') ?? '',
        black: boardStateDetails.black,
        white: boardStateDetails.white,
        draws: boardStateDetails.draws,
    };

    await insertBoardToDB(boardDbNode);

    if (lastMoveDecisionData) {
        const sourcePath = initial(path.uci).join(' ');
        const targetPath = path.uci.join(' ');
        const moveDbNode: MoveDBNode = {
            moveUci: last(path.uci)!,
            moveSan: path.san ? last(path.san)! : '',
            whitePercentage: lastMoveDecisionData.whitePercentage,
            blackPercentage: lastMoveDecisionData.blackPercentage,
            drawPercentage: lastMoveDecisionData.drawPercentage,
            numGames: lastMoveDecisionData.numGames,
            probablity: lastMoveDecisionData.probablity,
            cumulativeProbability: lastMoveDecisionData.cumulativeProbability,
        };

        await insertMoveToDB(sourcePath, targetPath, moveDbNode);
    }
}

import { promisify } from 'util';
import fetch from 'node-fetch';
import * as redis from 'redis';
import { BoardStateDetails, RequestSearchParams, MoveDecisionData, RunnerParams } from './types';
import {
    budapestDefensePath,
    exchangeCaroKannPath,
    italianBirdAttack,
    knightAttackPath,
    staffordGambitPath,
} from './openings';

const redisClient = redis.createClient();

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

/* ********************************************** */

init();

async function init() {
    const runnerParams: RunnerParams = {
        startingPath: italianBirdAttack,
        shouldExpand: ({ numGames }) => numGames > 500,
        shouldRecord: ({ numGames, whitePercentage, blackPercentage }) =>
            numGames > 500 && [whitePercentage, blackPercentage].some((percentage) => percentage > 60),
    };

    const recordedPaths = await runner(runnerParams);
    console.log('final result:', recordedPaths);
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
        body: null,
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

async function runner(params: RunnerParams) {
    const recordedPaths: string[][] = [];

    await recurse(params.startingPath);

    return recordedPaths;

    async function recurse(path: string[]) {
        const boardStateDetails = await fetchBoardStateDetails(path);
        const numBoardStateGames = boardStateDetails.white + boardStateDetails.black + boardStateDetails.draws;

        console.log('path:', path);
        console.log('number of games:', numBoardStateGames);

        const movesDecisionData: MoveDecisionData[] = boardStateDetails.moves.map((move) => {
            const numMoveGames = move.white + move.black + move.draws;
            const movePath = [...path, move.uci];

            return {
                path: movePath,
                numGames: numMoveGames,
                probablity: percentage(numMoveGames / numBoardStateGames),
                whitePercentage: percentage(move.white / numMoveGames),
                blackPercentage: percentage(move.black / numMoveGames),
                depth: movePath.length,
            };
        });

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

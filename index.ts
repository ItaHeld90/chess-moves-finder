import fetch from 'node-fetch';
import { BoardStateDetails, RequestSearchParams, MoveDecisionData, RunnerParams } from './types';

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
        shouldExpand: ({ numGames }) => numGames > 1000000,
    };

    runner(runnerParams);
}

async function fetchBoardStateDetails(previousMoves: string[]): Promise<BoardStateDetails> {
    const standardFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR+w+KQkq+-+0+1';
    const fen = standardFen.replace('+', ' ');

    const requestParams: RequestSearchParams = {
        fen,
        play: previousMoves.join(','),
    };
    const movesParam = new URLSearchParams(Object.entries(requestParams));

    const url = `https://explorer.lichess.ovh/lichess?${movesParam.toString()}&variant=standard&speeds%5B%5D=classical&speeds%5B%5D=rapid&speeds%5B%5D=blitz&speeds%5B%5D=bullet&ratings%5B%5D=2500&ratings%5B%5D=2200&ratings%5B%5D=2000&ratings%5B%5D=1800&ratings%5B%5D=1600`;
    const res = await fetch(url, {
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
    });

    const boardStateDetails = (await res.json()) as BoardStateDetails;
    return boardStateDetails;
}

function runner(params: RunnerParams) {
    return recurse([]);

    async function recurse(path: string[]) {
        if (path.length >= 4) return;

        await wait(1000);
        const boardStateDetails = await fetchBoardStateDetails(path);
        const numBoardStateGames = boardStateDetails.white + boardStateDetails.black + boardStateDetails.draws;

        console.log('path:', path);
        console.log('number of games:', numBoardStateGames);

        console.log(
            'possible moves:',
            boardStateDetails.moves.map((move) => move.uci)
        );

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
            const shouldExpand = params.shouldExpand(moveDecisionData);

            if (shouldExpand) {
                await recurse(moveDecisionData.path);
            }
        }
    }
}

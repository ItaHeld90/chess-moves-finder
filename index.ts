import fetch from 'node-fetch';
import { BoardStateDetails, RequestSearchParams } from './types';

// Utils

function wait(millis: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, millis);
    });
}

async function init() {
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

    recurse([]);

    async function recurse(path: string[]) {
        if (path.length >= 4) return;

        await wait(1000);
        const boardStateDetails = await fetchBoardStateDetails(path);

        console.log('path:', path);

        console.log(
            'possible moves:',
            boardStateDetails.moves.map((move) => move.uci)
        );

        const movesToExpand = boardStateDetails.moves.slice(0, 2);

        const newPaths = movesToExpand.map((move) => [...path, move.uci]);

        for (const path of newPaths) {
            await recurse(path);
        }
    }
}

init();

import fetch from 'node-fetch';
import { BoardStateDetails, RequestSearchParams } from './types';

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

    const boardStateDetails = await fetchBoardStateDetails([]);

    console.log(boardStateDetails.moves);
}

init();

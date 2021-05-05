import { BoardDBNode } from './../types';
import neo4j from 'neo4j-driver';

const CONNECTION_STRING = process.env.NEO4J_CONNECTION_STRING || 'bolt://localhost:7687';

const driver = neo4j.driver(CONNECTION_STRING);

export async function insertBoardToDB(board: BoardDBNode) {
    const { uci, black, white, draws } = board;

    const session = driver.session();
    await session.run(
        `
        CREATE (b:BOARD { uci: $uci, black: $black, white: $white, draws: $draws });
    `,
        {
            uci,
            black,
            white,
            draws,
        }
    );

    await session.close();
}

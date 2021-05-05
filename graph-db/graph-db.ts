import { BoardDBNode, MoveDBNode } from './../types';
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

export async function insertMoveToDB(sourceUci: string, targetUci: string, move: MoveDBNode) {
    const { moveUci, blackPercentage, whitePercentage, drawPercentage } = move;

    const session = driver.session();
    await session.run(
        `
        MATCH (source:BOARD { uci: $sourceUci })
        MATCH (target:BOARD { uci: $targetUci })
        CREATE (source)-[move:MOVE { moveUci: $moveUci, blackPercentage: $blackPercentage, whitePercentage: $whitePercentage, drawPercentage: $drawPercentage }]->(target);
    `,
        {
            sourceUci,
            targetUci,
            moveUci,
            blackPercentage,
            whitePercentage,
            drawPercentage,
        }
    );

    await session.close();
}

import { BoardDBNode, MoveDBNode } from './../types';
import neo4j from 'neo4j-driver';

const CONNECTION_STRING = process.env.NEO4J_CONNECTION_STRING || 'bolt://localhost:7687';

const driver = neo4j.driver(CONNECTION_STRING);

export async function insertBoardToDB(board: BoardDBNode) {
    const session = driver.session();
    await session.run(
        `
        CREATE (b:BOARD $board);
    `,
        {
            board,
        }
    );

    await session.close();
}

export async function insertMoveToDB(sourceUci: string, targetUci: string, move: MoveDBNode) {
    const session = driver.session();
    await session.run(
        `
        MATCH (source:BOARD { uci: $sourceUci })
        MATCH (target:BOARD { uci: $targetUci })
        CREATE (source)-[move:MOVE $move]->(target);
    `,
        {
            sourceUci,
            targetUci,
            move,
        }
    );

    await session.close();
}

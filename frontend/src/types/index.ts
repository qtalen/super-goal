export interface GameState {
  gameId: string | null;
  fen: string;
  turn: 'w' | 'b';
  status: string;
  difficulty: 1 | 2 | 3;
  legalMoves: string[];
  lastMove: string | null;
}

export interface MoveResponse extends GameState {
  aiMove: string;
}

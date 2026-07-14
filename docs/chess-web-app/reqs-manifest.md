# Chess Web App — Requirements Manifest

**Task Slug**: `chess-web-app`
**Tech Stack**: React + TypeScript + Vite (frontend) / Python + FastAPI + python-chess (backend)
**Data Persistence**: None (in-memory only)
**Online Play**: Not required

---

## Requirements List (Topological Order)

| # | Requirement | Description | Depends On | Status |
|---|------|------|------|------|
| 1 | FastAPI Project Init | Create backend directory structure, configure dependencies (fastapi, uvicorn, python-chess), basic app skeleton, entry file | — | passed |
| 2 | Game Session Management | Manage multiple game sessions in memory (create/query/delete), each holding a python-chess Board instance + difficulty setting | 1 | passed |
| 3 | AI Engine | Based on Minimax + Alpha-Beta pruning, distinguish 3 difficulty levels by search depth: Beginner (1-2 ply) / Intermediate (2-3 ply) / Advanced (3-4 ply) | 1 | passed |
| 4 | REST API Endpoints | `POST /games`, `GET /games/{id}`, `POST /games/{id}/move` (player move + AI response), get legal moves, etc. | 2, 3 | passed |
| 5 | React + Vite Project Init | Vite + TypeScript + SCSS project setup, component directory structure, basic layout | — | passed |
| 6 | Board UI Components | 8×8 board rendering, piece Unicode/CSS display, row/column coordinate labels, alternating light/dark squares | 5 | passed |
| 7 | Move Interaction | Click piece → highlight legal moves → click target square to move; drag-and-drop as alternative; capture/promotion special moves | 5, 6 | passed |
| 8 | Game Control Panel | Difficulty selection (Beginner/Intermediate/Advanced), turn indicator, check/checkmate/stalemate/draw status display, new game/undo buttons | 5 | passed |
| 9 | API Client + State Management | Encapsulate backend API calls, React Context + useReducer for global game state (board, turn, status) | 5, 4 | passed |
| 10 | Frontend-Backend Integration | CORS config, Vite proxy settings, end-to-end full flow verification (create → move → AI response → check → checkmate → game over) | 4, 7, 8, 9 | passed |

## Dependency Graph (Topological Execution Direction)

```
Backend:      1 ──→ 2 ──→ 4 ──────────────┐
               └─→ 3 ──┘                  │
                                           ├──→ 10 (Integration Verification)
Frontend:     5 ──→ 6 ──→ 7 ──────────────┤
               ├─→ 8 ─────────────────────┤
               └─→ 9 ─────────────────────┘
```

---

*Requirements manifest locked on 2026-07-07 after user confirmation.*

# Workflow connection numbers – bug fix (2026-02-25)

## Bug

- **Wrong order (e.g. 2, 1, 3 instead of 1, 2, 3):** Edges were sorted by **source X then Y**. In a vertical (top-to-bottom) flow, nodes share similar X, so order was unstable and did not match visual flow.

## Fix

- **Sort by source Y then X:** Edges are now ordered by **source node Y** (top to bottom), then source X, then target Y/X. The first connection from the top of the canvas gets 1, the next 2, then 3, so labels match the flow (1-1, 2-2, 3-3).

## Expected behavior

- Connection 1: topmost block → next block → both show **1**
- Connection 2: next → next → both show **2**
- Connection 3: next → next → both show **3**
- Unconnected handles show **0**

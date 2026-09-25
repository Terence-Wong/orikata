/**
 * Solver iterations per second of animation, so a fold takes the same time at any frame rate.
 * A crease pattern divided into many faces needs several thousand iterations for a big flap to
 * finish its swing within a step; with too few the solver lags and the landing blend visibly
 * snaps the model into place. The time budget below keeps a heavy model's frame rate.
 */
export const SUBSTEPS_PER_SECOND = 6000;
/** Never spend more than this many iterations on one rendered frame, however long it was. */
export const MAX_SUBSTEPS_PER_FRAME = 400;
/** Milliseconds of each rendered frame the solver may use before it starts cutting iterations. */
export const SOLVER_BUDGET_MS = 4;

/**
 * How many solver iterations to run this frame. The rate above sets the ideal; the time budget
 * takes over on a model too big to afford it, so a heavy model loses accuracy rather than frame
 * rate. It still lands exactly on the author's geometry, because the landing blend absorbs
 * whatever the solver did not reach.
 */
export function planSubsteps(
  dtSeconds: number,
  msPerSubstep: number,
  budgetMs = SOLVER_BUDGET_MS,
): number {
  const wanted = Math.round(Math.max(dtSeconds, 0) * SUBSTEPS_PER_SECOND);
  const affordable =
    msPerSubstep > 0 ? Math.floor(budgetMs / msPerSubstep) : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(wanted, affordable, MAX_SUBSTEPS_PER_FRAME));
}

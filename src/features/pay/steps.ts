/**
 * The "Saving" screen's step runner (prototype Main.dc.html L901–926).
 * Every step is real work (or a label for work an earlier step's call already
 * did); a step is only ticked after its work has succeeded, and the run stops
 * at the first failure so the member sees exactly what was and wasn't saved.
 */

export type SavingStep = {
  label: string;
  /** The work for this step. Omit for a line an earlier step's call already covered. */
  run?: () => Promise<void>;
};

export type StepStatus = 'done' | 'running' | 'pending' | 'failed';

/** Status of each row given how many steps finished and whether the current one failed. */
export function stepStatuses(count: number, doneCount: number, failed: boolean): StepStatus[] {
  return Array.from({ length: count }, (_, i) => {
    if (i < doneCount) return 'done';
    if (i === doneCount) return failed ? 'failed' : 'running';
    return 'pending';
  });
}

/**
 * Run steps in order starting at `from`, reporting progress. Resolves with
 * the number of steps completed; on failure resolves with the failing index
 * and the error instead of throwing, so the screen can offer "Try again"
 * from that step (earlier steps are never repeated).
 */
export async function runSteps(
  steps: SavingStep[],
  from: number,
  onProgress: (doneCount: number) => void,
  minStepMs = 0,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ ok: true; done: number } | { ok: false; done: number; error: unknown }> {
  for (let i = from; i < steps.length; i += 1) {
    const started = Date.now();
    try {
      await steps[i].run?.();
    } catch (error) {
      return { ok: false, done: i, error };
    }
    const spent = Date.now() - started;
    if (minStepMs > spent) await wait(minStepMs - spent);
    onProgress(i + 1);
  }
  return { ok: true, done: steps.length };
}

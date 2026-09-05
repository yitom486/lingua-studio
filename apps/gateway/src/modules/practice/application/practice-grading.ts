/** P5：客观题服务端权威判题纯函数（可单测）。 */

export interface ObjectiveQuestionLike {
  type?: string;
  correctAnswer?: string;
  acceptableVariants?: string[];
}

export function gradeObjectiveAnswer(
  question: ObjectiveQuestionLike | undefined,
  userAnswer: string,
): { isCorrect: boolean; authoritative: boolean } {
  if (!question || typeof question.correctAnswer !== 'string') {
    return { isCorrect: false, authoritative: false };
  }
  const norm = (s: string) => s.trim();
  const ans = norm(userAnswer ?? '');
  const key = norm(question.correctAnswer);
  if (question.type === 'FILL_IN_BLANK') {
    const ok =
      ans === key ||
      (Array.isArray(question.acceptableVariants) &&
        question.acceptableVariants.some((v) => norm(v) === ans));
    return { isCorrect: ok, authoritative: true };
  }
  return { isCorrect: ans === key, authoritative: true };
}

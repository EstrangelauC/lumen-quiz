import { biblicalScene } from '@/lib/biblical-background';

/** Full-screen decoration. Never read hidden options, scores or correct answers. */
export default function QuestionBackdrop({ reference, revealed }: { reference: string | null; revealed: boolean }) {
  const scene = revealed ? biblicalScene(reference) : null;
  return (
    <div className="question-backdrop" aria-hidden="true">
      {scene === null ? <div className="question-backdrop-neutral" /> : (
        <div className="question-backdrop-scene" style={{
          backgroundPosition: `${(scene % 6) * 20}% ${Math.floor(scene / 6) * (100 / 3)}%`,
        }} />
      )}
      <div className="question-backdrop-shade" />
    </div>
  );
}

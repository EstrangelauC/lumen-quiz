/** Decorative artwork only. Never select an illustration from an unrevealed answer. */
export default function BiblicalArt({ scene, className = '' }: {
  scene: 'noah' | 'david' | 'moses' | 'lamp' | 'landscape' | 'wreath';
  className?: string;
}) {
  return <div aria-hidden="true" className={`biblical-art biblical-art--${scene} ${className}`} />;
}

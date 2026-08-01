export function RequiredMark() {
  return (
    <span
      className="ml-0.5 font-black text-red-600"
      style={{ color: '#dc2626' }}
      aria-label="required"
      title="Required field"
    >
      *
    </span>
  );
}

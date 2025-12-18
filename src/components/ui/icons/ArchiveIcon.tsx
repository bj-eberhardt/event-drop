export const ArchiveIcon = ({ size = 18 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
      <path d="M3 8l2-4h14l2 4" />
      <path d="M9.5 12h5" />
      <path d="M11 10h2" />
      <path d="M12 10v8" />
    </svg>
  );
};

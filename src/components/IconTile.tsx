export function IconTile({
  tone = "blue",
  children,
  size = "regular",
}: {
  tone?: "blue" | "green" | "gold" | "red";
  children: React.ReactNode;
  size?: "regular" | "large";
}) {
  return (
    <span className={`icon-tile icon-tile--${tone} icon-tile--${size}`} aria-hidden="true">
      {children}
    </span>
  );
}

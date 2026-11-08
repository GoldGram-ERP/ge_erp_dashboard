/** The one divider and the one section title (owner, 2026-11-08). A screen with several sections gives each a title (`SectionTitle`) and puts a `Divider` between sections; never a hand-made <hr>, border-top or empty line. Look lives in globals.css (.rule, .sec-title). */
export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`rule${className ? ` ${className}` : ""}`} />;
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h3 className="sec-title" id={id}>{children}</h3>;
}

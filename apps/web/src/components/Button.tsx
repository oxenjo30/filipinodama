import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "red" | "purple" | "blue" | "green" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

/**
 * Button — uppercase Inter 700 action button with the five prototype gradients.
 *
 * Gradients, border, insets, hover brightness and active translateY all come
 * from the `.btn` / `.btn-<variant>` classes (index.css). Variants:
 *  - red / purple / blue / green: light foreground
 *  - gold: dark foreground (#3a2405) on a bright gold gradient
 */
export function Button({
  variant = "purple",
  size = "md",
  block = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn-${variant}`,
    SIZE_CLASS[size],
    block ? "btn-block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export default Button;

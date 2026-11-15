import { buttonStyles } from "./button";
import { Icon } from "./icon";
import { cn } from "@/lib/cn";

type SearchInputProps = {
  /** Page that receives the query as `?q=`. */
  action: string;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Search box that submits as a plain GET form, so it works without JavaScript
 * and results are shareable URLs. The destination page does the searching.
 */
export function SearchInput({
  action,
  defaultValue,
  label = "Search",
  placeholder = "Search",
  className,
}: SearchInputProps) {
  return (
    <form action={action} method="get" role="search" className={cn("flex w-full gap-2", className)}>
      <div className="relative flex-1">
        <label htmlFor={`search-${action}`} className="sr-only">
          {label}
        </label>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id={`search-${action}`}
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-11 w-full rounded-control border border-line-strong/60 bg-surface py-2 pl-10 pr-3 text-base placeholder:text-muted/70"
        />
      </div>
      <button type="submit" className={buttonStyles({ variant: "primary" })}>
        Search
      </button>
    </form>
  );
}

export function formatPrice(value: number | null) {
  if (value === null) return "N/A";
  return `Rs. ${value.toLocaleString("en-IN")}`;
}

export function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

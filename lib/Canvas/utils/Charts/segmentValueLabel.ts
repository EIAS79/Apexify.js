/**
 * Text drawn for a bar segment when value labels are shown:
 * uses `segment.label` when non-empty, otherwise the numeric value.
 */
export function segmentValueDisplayText(segment: { value: number; label?: string }): string {
  const t = segment.label?.trim();
  return t !== undefined && t.length > 0 ? t : String(segment.value);
}

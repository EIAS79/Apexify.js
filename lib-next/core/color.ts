import { ApexifyInputError } from "../runtime/errors";

/**
 * Validates a hexadecimal color string (`#RRGGBB`).
 * @throws {ApexifyInputError} if the format is invalid
 */
export function validHex(hexColor: string): boolean {
  if (typeof hexColor !== "string") {
    throw new ApexifyInputError("validHex: hexColor must be a string.");
  }
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  if (!hexPattern.test(hexColor)) {
    throw new ApexifyInputError("validHex: Invalid hexadecimal color format. It should be in the format '#RRGGBB'.");
  }
  return true;
}

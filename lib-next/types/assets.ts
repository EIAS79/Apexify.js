export type AssetScalar = string | number | boolean | null | Buffer;
export type AssetValue = AssetScalar | readonly AssetValue[] | { readonly [key: string]: AssetValue };
export type AssetResolveFn = (refPath: string) => AssetValue;
export type AssetKind = "image" | "font" | "palette" | "value";

export interface AssetRegistrationInfo {
  name: string;
  kind: AssetKind;
}

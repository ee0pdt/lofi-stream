export function roleRouting(role: string): { trackKey: string; rowId: string } {
  return role === "rhodesMel"
    ? { trackKey: "melody", rowId: "mx-melody" }
    : { trackKey: "comp", rowId: "mx-comp" };
}

const hues = [42, 196, 340, 148, 268];

/** プレイヤーごとのアバター色相。 */
export function seatHue(index: number): number {
  return hues[index % hues.length];
}

/** アバターの文字。既定名のままなら席番号、名前を付けたら頭文字。 */
export function avatarText(name: string, index: number): string {
  return name === `プレイヤー${index + 1}` ? String(index + 1) : Array.from(name)[0] ?? "?";
}

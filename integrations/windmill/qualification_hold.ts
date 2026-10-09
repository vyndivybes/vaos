export async function main(challenge: string) {
  if (!/^[a-f0-9]{32,64}$/.test(challenge)) throw new Error("INVALID_SYNTHETIC_CHALLENGE");
  await new Promise<void>((resolve) => setTimeout(resolve, 45000));
  return { qualification: "VAOS_WINDMILL_CANCELLATION_DRILL_V1", challenge };
}

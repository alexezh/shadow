export function make31BitId(): string {
  // Generate a random 31-bit number (0 to 2^31 - 1)
  const max31Bit = Math.pow(2, 31) - 1;
  const randomId = Math.floor(Math.random() * max31Bit);
  // use a-z and 0-9
  return randomId.toString(36);
}


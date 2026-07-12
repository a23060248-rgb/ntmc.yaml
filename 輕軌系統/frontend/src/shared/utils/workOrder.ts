export const workOrderTypes = ["P", "C", "R", "J", "I"] as const;
export type WorkOrderType = (typeof workOrderTypes)[number];

const workOrderPattern = /^(P|C|R|J|I)-(\d{7})-([A-Z])-([A-Z0-9]+)-(\d{3})$/;

export function isWorkOrderNo(value: string) {
  return workOrderPattern.test(value.trim().toUpperCase());
}

export function parseWorkOrderNo(value: string) {
  const match = workOrderPattern.exec(value.trim().toUpperCase());
  if (!match) return null;
  return {
    type: match[1] as WorkOrderType,
    rocDate: match[2],
    site: match[3],
    target: match[4],
    sequence: match[5],
  };
}

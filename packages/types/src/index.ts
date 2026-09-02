export type UUID = string;

export type Money = {
  amount: string;
  currency: string;
};

export type AuditStamp = {
  createdAt: string;
  createdBy: UUID;
};

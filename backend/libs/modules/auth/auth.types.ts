export interface JwtUserPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string; // 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'BILLING' | 'STAFF'
  isStaff: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
      project?: any;
      organization?: any;
      rawBody?: Buffer;
    }
  }
}

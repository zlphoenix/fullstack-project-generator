/** Standard API response envelope */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Authenticated user */
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** JWT token pair */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

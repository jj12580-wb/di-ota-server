import { create } from 'zustand';

interface AuthState {
  token: string | null;
  isLoggedIn: boolean;
  username: string;
  roles: string[];
  authSource: 'local' | 'sso';
  hasExternalAccess: boolean;
  setAuth: (token: string) => void;
  logout: () => void;
  init: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isLoggedIn: false,
  username: '管理员',
  roles: ['admin'],
  authSource: 'local',
  hasExternalAccess: false,
  setAuth: (token: string) => {
    localStorage.setItem('jwt_token', token);
    set({
      token,
      isLoggedIn: true,
      username: '管理员',
      roles: ['admin'],
      authSource: 'local',
      hasExternalAccess: false,
    });
  },
  logout: () => {
    localStorage.removeItem('jwt_token');
    set({
      token: null,
      isLoggedIn: false,
      username: '管理员',
      roles: ['admin'],
      authSource: 'local',
      hasExternalAccess: false,
    });
  },
  init: () => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      set({
        token,
        isLoggedIn: true,
        username: '管理员',
        roles: ['admin'],
        authSource: 'local',
        hasExternalAccess: false,
      });
    }
  },
}));

export default useAuthStore;

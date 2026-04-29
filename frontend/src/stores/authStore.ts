import { create } from 'zustand';

interface AuthState {
  token: string | null;
  isLoggedIn: boolean;
  setAuth: (token: string) => void;
  logout: () => void;
  init: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isLoggedIn: false,
  setAuth: (token: string) => {
    localStorage.setItem('jwt_token', token);
    set({ token, isLoggedIn: true });
  },
  logout: () => {
    localStorage.removeItem('jwt_token');
    set({ token: null, isLoggedIn: false });
  },
  init: () => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      set({ token, isLoggedIn: true });
    }
  },
}));

export default useAuthStore;

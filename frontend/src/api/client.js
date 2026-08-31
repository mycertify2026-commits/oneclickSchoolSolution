import axios from 'axios';

console.log("====================================");
console.log("API URL:", process.env.REACT_APP_API_URL);
console.log("====================================");

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: {
    "Content-Type": "application/json"
  }
});

console.log("Base URL:", api.defaults.baseURL);

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cp_access_token');

  console.log("====================================");
  console.log("REQUEST");
  console.log("URL:", `${config.baseURL}${config.url}`);
  console.log("Method:", config.method);
  console.log("Data:", config.data);
  console.log("====================================");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response) => {
    console.log("====================================");
    console.log("SUCCESS RESPONSE");
    console.log(response.status);
    console.log(response.data);
    console.log("====================================");
    return response;
  },

  async (err) => {
    console.log("====================================");
    console.log("API ERROR");
    console.log("Status:", err?.response?.status);
    console.log("Response:", err?.response?.data);
    console.log("Request URL:", err?.config?.url);
    console.log("Base URL:", api.defaults.baseURL);
    console.log("====================================");

    const { config, response } = err;

    // A failed login is an authentication error, not an expired session.
    // Without this guard the login form's own 401 response clears the form
    // and redirects back to "/" with the misleading session-expired banner.
    const requestUrl = config?.url || '';
    const isAuthLifecycleRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');
    const accessToken = localStorage.getItem('cp_access_token');

    if (
      !response ||
      response.status !== 401 ||
      !config ||
      config._retried ||
      isAuthLifecycleRequest ||
      !accessToken
    ) {
      return Promise.reject(err);
    }

    const refreshToken = localStorage.getItem('cp_refresh_token');

    if (!refreshToken) {
      clearSessionAndRedirect();
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((newToken) => {
          if (!newToken) return reject(err);

          config._retried = true;
          config.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(config));
        });
      });
    }

    isRefreshing = true;

    try {
      const res = await axios.post(
        `${api.defaults.baseURL}/auth/refresh`,
        { refreshToken }
      );

      const newAccessToken = res.data.accessToken;

      localStorage.setItem('cp_access_token', newAccessToken);

      isRefreshing = false;
      onRefreshed(newAccessToken);

      config._retried = true;
      config.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(config);

    } catch (refreshErr) {

      console.log("Refresh Token Error:", refreshErr?.response?.data);

      isRefreshing = false;
      onRefreshed(null);

      clearSessionAndRedirect();

      return Promise.reject(refreshErr);
    }
  }
);

function clearSessionAndRedirect() {
  localStorage.removeItem('cp_access_token');
  localStorage.removeItem('cp_refresh_token');
  localStorage.removeItem('cp_user');

  localStorage.setItem(
    'cp_logout_broadcast',
    String(Date.now())
  );

  sessionStorage.setItem(
    'cp_session_expired',
    '1'
  );

  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

export default api;
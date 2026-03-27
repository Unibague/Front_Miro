import axios from 'axios';

// Configuración global de axios para manejar UTF-8
axios.defaults.headers.common['Accept'] = 'application/json; charset=utf-8';
axios.defaults.headers.common['Content-Type'] = 'application/json; charset=utf-8';
axios.defaults.responseType = 'json';
axios.defaults.responseEncoding = 'utf8';

// Interceptor para requests
axios.interceptors.request.use(
  (config) => {
    config.headers['Accept'] = 'application/json; charset=utf-8';
    config.headers['Content-Type'] = 'application/json; charset=utf-8';
    config.headers['Accept-Charset'] = 'utf-8';
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para responses
axios.interceptors.response.use(
  (response) => {
    // Decodificar entidades HTML si es necesario
    if (typeof response.data === 'string') {
      response.data = response.data
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axios;
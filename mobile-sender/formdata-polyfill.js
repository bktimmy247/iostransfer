import FormDataPolyfill from 'react-native/Libraries/Network/FormData';

if (typeof globalThis.FormData === 'undefined') {
  globalThis.FormData = FormDataPolyfill;
}

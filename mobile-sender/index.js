// Install required React Native globals before loading app/dependencies.
import './formdata-polyfill';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

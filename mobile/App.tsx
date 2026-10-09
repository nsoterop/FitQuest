import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {AccountPanel} from './src/AccountPanel';
import {ui} from './src/Design';
export default function App(){return <SafeAreaProvider><SafeAreaView style={ui.screen}><StatusBar style="dark"/><AccountPanel/></SafeAreaView></SafeAreaProvider>}

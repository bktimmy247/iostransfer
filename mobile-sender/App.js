import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';

const URL_KEY = 'ios-transfer.pc-url';

function fmt(bytes = 0) {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
function normalizeUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export default function App() {
  const [pcUrl, setPcUrl] = useState('');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('Dán địa chỉ PC receiver rồi chọn file/video để gửi.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ fileIndex: 0, sent: 0, total: 0 });
  const baseUrl = useMemo(() => normalizeUrl(pcUrl), [pcUrl]);

  useEffect(() => {
    AsyncStorage.getItem(URL_KEY).then(v => { if (v) setPcUrl(v); });
  }, []);
  useEffect(() => {
    if (baseUrl) AsyncStorage.setItem(URL_KEY, baseUrl).catch(() => {});
  }, [baseUrl]);

  async function testConnection() {
    if (!baseUrl) return Alert.alert('Thiếu địa chỉ PC', 'Ví dụ: http://192.168.100.2:8799');
    try {
      setStatus('Đang kiểm tra kết nối tới PC...');
      const res = await fetch(`${baseUrl}/api/info`);
      const data = await res.json();
      if (!data.ok) throw new Error('PC receiver trả về lỗi');
      setStatus(`Kết nối OK. File sẽ lưu ở PC: ${data.uploadDir || 'thư mục receiver'}`);
    } catch (err) {
      setStatus(`Không kết nối được: ${err.message}`);
      Alert.alert('Không kết nối được PC', 'Kiểm tra PC và iPhone cùng Wi‑Fi, app PC đang mở, và Windows Firewall đã allow.');
    }
  }

  async function pickFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: false,
        type: '*/*',
      });
      if (result.canceled) return;
      const picked = (result.assets || []).map(asset => ({
        uri: asset.uri,
        name: asset.name || 'file',
        size: asset.size || 0,
        mimeType: asset.mimeType || 'application/octet-stream',
      }));
      setFiles(picked);
      const total = picked.reduce((sum, item) => sum + (item.size || 0), 0);
      setStatus(`Đã chọn ${picked.length} file · tổng ${fmt(total)}.`);
    } catch (err) {
      Alert.alert('Không chọn được file', err.message);
    }
  }

  async function uploadFile(file, index, totalCount) {
    const endpoint = `${baseUrl}/api/upload-one`;
    return new Promise((resolve, reject) => {
      const task = FileSystem.createUploadTask(
        endpoint,
        file.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: file.mimeType || 'application/octet-stream',
          parameters: { source: 'expo-sender', originalName: file.name },
        },
        ({ totalBytesSent, totalBytesExpectedToSend }) => {
          const total = totalBytesExpectedToSend || file.size || 0;
          setProgress({ fileIndex: index + 1, sent: totalBytesSent, total });
          const pct = total ? Math.round((totalBytesSent / total) * 100) : 0;
          setStatus(`Đang gửi ${index + 1}/${totalCount}: ${file.name} — ${pct}% (${fmt(totalBytesSent)} / ${fmt(total)})`);
        }
      );
      task.uploadAsync()
        .then(res => {
          if (res.status < 200 || res.status >= 300) throw new Error(res.body || `HTTP ${res.status}`);
          resolve(res);
        })
        .catch(reject);
    });
  }

  async function uploadAll() {
    if (!baseUrl) return Alert.alert('Thiếu địa chỉ PC', 'Dán địa chỉ hiện trên app PC, ví dụ http://192.168.100.2:8799');
    if (!files.length) return Alert.alert('Chưa chọn file', 'Bấm “Chọn file/video” trước.');
    setBusy(true);
    await activateKeepAwakeAsync('ios-transfer-upload').catch(() => {});
    const failed = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        try {
          await uploadFile(files[i], i, files.length);
        } catch (err) {
          failed.push(`${files[i].name}: ${err.message}`);
        }
      }
      if (failed.length) {
        setStatus(`Gửi xong ${files.length - failed.length}/${files.length} file. Có ${failed.length} file lỗi.`);
        Alert.alert('Có file lỗi', failed.slice(0, 3).join('\n'));
      } else {
        setStatus(`Gửi xong toàn bộ ${files.length} file. Kiểm tra thư mục trên PC.`);
        Alert.alert('Xong', 'File đã gửi về PC.');
        setFiles([]);
      }
    } finally {
      setBusy(false);
      setProgress({ fileIndex: 0, sent: 0, total: 0 });
      deactivateKeepAwake('ios-transfer-upload');
    }
  }

  const totalSelected = files.reduce((sum, item) => sum + (item.size || 0), 0);
  const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
        <Text style={styles.badge}>iOS native sender · không qua Safari</Text>
        <Text style={styles.title}>Gửi file/video lớn về PC</Text>
        <Text style={styles.sub}>App dùng picker native và upload từ file URI của iPhone, giảm lỗi bộ nhớ tạm Safari khi gửi video dài.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Địa chỉ PC receiver</Text>
          <TextInput
            value={pcUrl}
            onChangeText={setPcUrl}
            placeholder="http://192.168.100.2:8799"
            placeholderTextColor="#789"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TouchableOpacity disabled={busy} onPress={testConnection} style={[styles.button, styles.secondary]}><Text style={styles.buttonText}>Kiểm tra kết nối</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <TouchableOpacity disabled={busy} onPress={pickFiles} style={styles.button}><Text style={styles.buttonText}>1. Chọn file/video</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy || !files.length} onPress={uploadAll} style={[styles.button, (!files.length || busy) && styles.disabled]}><Text style={styles.buttonText}>2. Upload về PC</Text></TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
          {progress.total > 0 ? <View style={styles.progress}><View style={[styles.bar, { width: `${pct}%` }]} /><Text style={styles.percent}>{pct}%</Text></View> : null}
          {files.length ? <Text style={styles.meta}>Đã chọn {files.length} file · {fmt(totalSelected)}</Text> : null}
        </View>

        <FlatList
          data={files}
          keyExtractor={(item, idx) => `${item.uri}-${idx}`}
          renderItem={({ item }) => <View style={styles.file}><Text style={styles.fileName}>{item.name}</Text><Text style={styles.fileSize}>{fmt(item.size)}</Text></View>}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07111f' },
  page: { flex: 1, padding: 18, gap: 14 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', color: '#166534', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, fontWeight: '900', overflow: 'hidden' },
  title: { color: '#fff', fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1 },
  sub: { color: '#b6c6dc', fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(148,163,184,0.22)', borderWidth: 1, borderRadius: 24, padding: 16, gap: 10 },
  label: { color: '#dbeafe', fontWeight: '800' },
  input: { backgroundColor: '#0e1d31', color: '#fff', borderColor: '#24415f', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  button: { backgroundColor: '#22c55e', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  secondary: { backgroundColor: '#1f334b' },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#03111f', fontWeight: '950', fontSize: 16 },
  status: { color: '#dbeafe', lineHeight: 20, marginTop: 2 },
  meta: { color: '#93c5fd', fontWeight: '800' },
  progress: { height: 22, borderRadius: 999, backgroundColor: '#12263e', overflow: 'hidden', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#38bdf8' },
  percent: { color: '#fff', fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 3 },
  file: { backgroundColor: '#0e1d31', borderColor: 'rgba(148,163,184,0.18)', borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 8 },
  fileName: { color: '#fff', fontWeight: '800' },
  fileSize: { color: '#94a3b8', marginTop: 4 },
});

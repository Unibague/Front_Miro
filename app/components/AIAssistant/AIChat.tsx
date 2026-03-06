"use client";

import { useState, useEffect } from 'react';
import { Modal, TextInput, Button, ScrollArea, Text, Group, ActionIcon, Paper, Loader, Textarea, Stack, ThemeIcon } from '@mantine/core';
import { IconSend, IconRobot, IconFileTypeDocx, IconFileTypeXls, IconFileTypePdf, IconSparkles } from '@tabler/icons-react';
import axios from 'axios';
import DocumentUploader from './DocumentUploader';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  opened: boolean;
  onClose: () => void;
}

const AIChat = ({ opened, onClose }: AIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [generatingFile, setGeneratingFile] = useState(false);
  const [promptModalOpened, setPromptModalOpened] = useState(false);
  const [fileType, setFileType] = useState<'word' | 'excel' | 'pdf'>('word');
  const [promptInput, setPromptInput] = useState('');

  // Verificar estado del servicio al abrir el chat
  useEffect(() => {
    if (opened) {
      checkHealth();
    }
  }, [opened]);

  const checkHealth = async () => {
    try {
      await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/ai-assistant/health`, {
        timeout: 5000
      });
      setHealthStatus('online');
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: '¡Hola! Soy Ardi, tu asistente de IA. ¿En qué puedo ayudarte con la aplicación?',
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      setHealthStatus('offline');
      setMessages([{
        role: 'assistant',
        content: 'Lo siento, el servicio de IA no está disponible en este momento. Por favor contacta al administrador.',
        timestamp: new Date()
      }]);
    }
  };

  const handleDocumentUploading = (filename: string) => {
    const uploadingMessage: Message = {
      role: 'assistant',
      content: `📄 Procesando el documento "${filename}"... Por favor espera mientras analizo su contenido.`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, uploadingMessage]);
  };

  const handleDocumentAnalyzed = (analysis: string, filename: string) => {
    const documentMessage: Message = {
      role: 'assistant',
      content: `📄 **Análisis completo del documento "${filename}":**\n\n${analysis}\n\n❓ **Ahora puedes hacerme preguntas específicas sobre este documento.**`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, documentMessage]);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      // Preparar historial para el backend
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/ai-assistant/chat`, {
        message: currentInput,
        history: history
      }, {
        timeout: 30000
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.response || response.data.message || 'Respuesta recibida',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      let errorMessage = 'Lo siento, hubo un error al procesar tu mensaje.';
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'La consulta tardó demasiado. El servicio de IA podría estar ocupado.';
        } else if (error.message.includes('socket hang up')) {
          errorMessage = 'El servicio de IA no está disponible. Por favor contacta al administrador.';
        } else if (error.response?.status === 500) {
          errorMessage = 'Error interno del servidor de IA. Intenta de nuevo en unos momentos.';
        }
      }
      
      const errorMsg: Message = {
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const generateFile = async (type: 'word' | 'excel' | 'pdf', prompt: string) => {
    if (!prompt.trim()) return;

    setGeneratingFile(true);
    const generatingMessage: Message = {
      role: 'assistant',
      content: `🔄 Generando archivo ${type.toUpperCase()}... Por favor espera.`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, generatingMessage]);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai-assistant/generate-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      if (!response.ok) throw new Error('Error en la generación');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-ia.${type === 'word' ? 'docx' : type === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);

      const successMessage: Message = {
        role: 'assistant',
        content: `✅ ¡Archivo ${type.toUpperCase()} generado y descargado exitosamente!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, successMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `❌ Error al generar el archivo ${type.toUpperCase()}. Intenta de nuevo.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setGeneratingFile(false);
    }
  };

  const openPromptModal = (type: 'word' | 'excel' | 'pdf') => {
    setFileType(type);
    const defaultPrompts = {
      word: 'Genera un informe de acreditación con introducción, objetivos y conclusiones',
      excel: 'Genera tabla con 5 indicadores: nombre, valor, meta, cumplimiento',
      pdf: 'Genera informe con introducción, desarrollo y conclusiones'
    };
    setPromptInput(defaultPrompts[type]);
    setPromptModalOpened(true);
  };

  const handleGenerateFile = () => {
    generateFile(fileType, promptInput);
    setPromptModalOpened(false);
    setPromptInput('');
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconRobot size={20} />
          <Text fw={500}>Ardi - Asistente IA</Text>
          {healthStatus === 'online' && <Text size="xs" c="green">• En línea</Text>}
          {healthStatus === 'offline' && <Text size="xs" c="red">• Desconectado</Text>}
          {healthStatus === 'checking' && <Text size="xs" c="yellow">• Verificando...</Text>}
        </Group>
      }
      size="xl"
      styles={{
        body: { padding: 0 },
        header: { borderBottom: '1px solid #e9ecef' }
      }}
    >
      <ScrollArea h={500} p="md">
        <DocumentUploader 
          onDocumentAnalyzed={handleDocumentAnalyzed}
          onDocumentUploading={handleDocumentUploading}
          disabled={healthStatus === 'offline' || loading}
        />
        {messages.map((message, index) => (
          <Paper
            key={index}
            p="sm"
            mb="xs"
            bg={message.role === 'user' ? 'blue.0' : 'gray.0'}
            style={{
              marginLeft: message.role === 'user' ? '20%' : '0',
              marginRight: message.role === 'assistant' ? '20%' : '0'
            }}
          >
            <Text size="sm" fw={500} c={message.role === 'user' ? 'blue' : 'dark'}>
              {message.role === 'user' ? 'Tú' : 'Ardi'}
            </Text>
            <Text size="sm" mt={2}>
              {message.content}
            </Text>
          </Paper>
        ))}
        {loading && (
          <Paper p="sm" mb="xs" bg="gray.0" style={{ marginRight: '20%' }}>
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">Ardi está escribiendo...</Text>
            </Group>
          </Paper>
        )}
      </ScrollArea>
      
      <Group gap="xs" p="md" style={{ borderTop: '1px solid #e9ecef' }}>
        <Group gap="xs" mb="xs">
          <Button 
            size="xs" 
            leftSection={<IconFileTypeDocx size={14} />} 
            loading={generatingFile} 
            onClick={() => openPromptModal('word')}
            variant="light"
          >
            Word
          </Button>
          <Button 
            size="xs" 
            leftSection={<IconFileTypeXls size={14} />} 
            loading={generatingFile} 
            onClick={() => openPromptModal('excel')}
            variant="light"
          >
            Excel
          </Button>
          <Button 
            size="xs" 
            leftSection={<IconFileTypePdf size={14} />} 
            loading={generatingFile} 
            onClick={() => openPromptModal('pdf')}
            variant="light"
          >
            PDF
          </Button>
        </Group>
        <TextInput
          flex={1}
          placeholder="Escribe tu pregunta..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <ActionIcon
          variant="filled"
          color="blue"
          onClick={sendMessage}
          disabled={loading || !input.trim() || healthStatus === 'offline'}
        >
          <IconSend size={16} />
        </ActionIcon>
      </Group>
      
      {/* Modal para prompt de generación de archivos */}
      <Modal
        opened={promptModalOpened}
        onClose={() => setPromptModalOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              {fileType === 'word' && <IconFileTypeDocx size={20} />}
              {fileType === 'excel' && <IconFileTypeXls size={20} />}
              {fileType === 'pdf' && <IconFileTypePdf size={20} />}
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={600} size="lg">Generar {fileType.toUpperCase()}</Text>
              <Text size="sm" c="dimmed">Describe qué quieres que genere la IA</Text>
            </Stack>
          </Group>
        }
        size="xl"
        overlayProps={{ backgroundOpacity: 0.7, blur: 4 }}
        styles={{
          header: { 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: '8px 8px 0 0'
          },
          title: { color: 'white', width: '100%' }
        }}
      >
        <Stack gap="md" p="md">
          <Text size="sm" c="dimmed">
            🤖 Ardi usará estas instrucciones para generar tu archivo {fileType.toUpperCase()}. 
            Sé específico para obtener mejores resultados.
          </Text>
          
          <Textarea
            label="Instrucciones para la IA"
            placeholder={`Describe qué contenido debe tener el archivo ${fileType.toUpperCase()}...`}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            minRows={6}
            maxRows={10}
            autosize
            styles={{
              input: {
                border: '2px solid #e9ecef',
                '&:focus': {
                  borderColor: '#667eea',
                  boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
                }
              }
            }}
          />
          
          <Group justify="flex-end" gap="sm">
            <Button 
              variant="outline" 
              onClick={() => setPromptModalOpened(false)}
              disabled={generatingFile}
            >
              Cancelar
            </Button>
            <Button 
              leftSection={<IconSparkles size={16} />}
              onClick={handleGenerateFile}
              disabled={!promptInput.trim() || generatingFile}
              loading={generatingFile}
              gradient={{ from: 'blue', to: 'cyan' }}
              variant="gradient"
            >
              Generar Archivo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
};

export default AIChat;
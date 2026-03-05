"use client";

import { useState, useEffect } from 'react';
import { Modal, TextInput, Button, ScrollArea, Text, Group, ActionIcon, Paper, Loader } from '@mantine/core';
import { IconSend, IconRobot } from '@tabler/icons-react';
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
      size="md"
      styles={{
        body: { padding: 0 },
        header: { borderBottom: '1px solid #e9ecef' }
      }}
    >
      <ScrollArea h={400} p="md">
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
    </Modal>
  );
};

export default AIChat;
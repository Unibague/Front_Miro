"use client";

import { useState } from 'react';
import { Button, Group, Text, Paper, Progress, Alert, FileInput, Modal, Select, TextInput } from '@mantine/core';
import { IconUpload, IconFile, IconX } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import axios from 'axios';

interface DocumentUploaderProps {
  onDocumentAnalyzed: (analysis: string, filename: string) => void;
  onDocumentUploading: (filename: string) => void;
  disabled?: boolean;
}

const DocumentUploader = ({ onDocumentAnalyzed, onDocumentUploading, disabled }: DocumentUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisType, setAnalysisType] = useState<string>('summary');
  const [customQuestion, setCustomQuestion] = useState('');
  const [opened, { open, close }] = useDisclosure(false);

  const analysisOptions = [
    { value: 'summary', label: 'Resumen del documento' },
    { value: 'extract', label: 'Extraer información clave' },
    { value: 'validate', label: 'Validar contenido' },
    { value: 'custom', label: 'Pregunta personalizada' }
  ];

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setAnalysisType('summary');
    setCustomQuestion('');
    open();
  };

  const handleAnalysis = async () => {
    if (!selectedFile) return;

    close();
    onDocumentUploading(selectedFile.name);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('analysisType', analysisType);
    
    let question = '';
    switch (analysisType) {
      case 'summary':
        question = 'Proporciona un resumen detallado del contenido, estructura y puntos clave de este documento.';
        break;
      case 'extract':
        question = 'Extrae la información más importante, datos clave, fechas, nombres y conceptos relevantes de este documento.';
        break;
      case 'validate':
        question = 'Valida la coherencia, estructura y calidad del contenido de este documento. Identifica posibles errores o inconsistencias.';
        break;
      case 'custom':
        question = customQuestion || 'Analiza este documento.';
        break;
    }
    
    formData.append('question', question);

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/ai-assistant/analyze-document`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 300000, // 5 minutos para análisis de documentos
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(percentCompleted);
          },
        }
      );

      onDocumentAnalyzed(response.data.analysis, selectedFile.name);
    } catch (error: any) {
      console.error('Error analyzing document:', error);
      let errorMessage = 'Error al analizar el documento. Intenta de nuevo.';
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'El análisis del documento tardó demasiado. Intenta con un archivo más pequeño.';
        } else if (error.response?.status === 413) {
          errorMessage = 'El archivo es demasiado grande. Intenta con un archivo más pequeño.';
        } else if (error.response?.status === 500) {
          errorMessage = 'Error interno del servidor. El servicio de IA podría estar ocupado.';
        }
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Paper p="sm" withBorder mb="xs">
      <Group gap="xs" align="center">
        <FileInput
          placeholder="Seleccionar documento"
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          leftSection={<IconFile size={16} />}
          style={{ flex: 1 }}
        />
      </Group>
      
      {error && (
        <Alert color="red" mt="xs">
          {error}
        </Alert>
      )}

      {uploading && (
        <div>
          <Text size="xs" mt="xs">
            Analizando documento... {progress}%
          </Text>
          <Progress value={progress} size="xs" mt={4} />
        </div>
      )}
      
      <Modal opened={opened} onClose={close} title="¿Cómo quieres analizar el documento?">
        <Select
          label="Tipo de análisis"
          data={analysisOptions}
          value={analysisType}
          onChange={(value) => setAnalysisType(value || 'summary')}
          mb="md"
        />
        
        {analysisType === 'custom' && (
          <TextInput
            label="Tu pregunta personalizada"
            placeholder="¿Qué quieres saber del documento?"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            mb="md"
          />
        )}
        
        <Group justify="flex-end">
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button 
            onClick={handleAnalysis}
            disabled={analysisType === 'custom' && !customQuestion.trim()}
          >
            Analizar
          </Button>
        </Group>
      </Modal>
    </Paper>
  );
};

export default DocumentUploader;
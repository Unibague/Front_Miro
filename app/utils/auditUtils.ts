import axios from 'axios';

export interface AuditLog {
  user_email: string;
  action: string;
  entity_type: string;
  entity_name: string;
  details?: string;
}

export const logTemplateChange = async (
  templateId: string,
  templateName: string,
  action: 'create' | 'update' | 'delete',
  adminEmail: string,
  details?: any
) => {
  try {
    const auditData: AuditLog = {
      user_email: adminEmail,
      action,
      entity_type: 'template',
      entity_name: templateName,
      details: typeof details === 'string' ? details : JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging template change:', error);
  }
};

export const logFieldChange = async (
  templateName: string,
  fieldName: string,
  action: 'create' | 'update' | 'delete',
  adminEmail: string,
  changes?: any
) => {
  try {
    const actionText = action === 'create' ? 'agregó' : action === 'update' ? 'actualizó' : 'eliminó';
    const details = {
      templateName,
      fieldName,
      action: actionText,
      changes
    };

    const auditData: AuditLog = {
      user_email: adminEmail,
      action,
      entity_type: 'template',
      entity_name: templateName,
      details: JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging field change:', error);
  }
};

export const logProducerChange = async (
  templateName: string,
  producerName: string,
  action: 'create' | 'delete',
  adminEmail: string
) => {
  try {
    const actionText = action === 'create' ? 'agregó' : 'eliminó';
    const details = {
      templateName,
      producerName,
      action: `${actionText} el productor "${producerName}" ${action === 'create' ? 'a' : 'de'} la plantilla "${templateName}"`
    };

    const auditData: AuditLog = {
      user_email: adminEmail,
      action,
      entity_type: 'template',
      entity_name: templateName,
      details: JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging producer change:', error);
  }
};

export const logDimensionChange = async (
  templateName: string,
  dimensionName: string,
  action: 'create' | 'delete',
  adminEmail: string
) => {
  try {
    const actionText = action === 'create' ? 'agregó' : 'eliminó';
    const details = {
      templateName,
      dimensionName,
      action: `${actionText} el ámbito "${dimensionName}" ${action === 'create' ? 'a' : 'de'} la plantilla "${templateName}"`
    };

    const auditData: AuditLog = {
      user_email: adminEmail,
      action,
      entity_type: 'template',
      entity_name: templateName,
      details: JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging dimension change:', error);
  }
};

export const logDependencyPermissionChange = async (
  userEmail: string,
  userName: string,
  dependencyChanges: {
    added: string[];
    removed: string[];
  },
  adminEmail: string
) => {
  try {
    const details = {
      targetUser: {
        email: userEmail,
        name: userName
      },
      changes: dependencyChanges,
      action: 'Actualización de permisos de dependencias'
    };

    const auditData: AuditLog = {
      user_email: adminEmail,
      action: 'update',
      entity_type: 'dependency_permission',
      entity_name: `Permisos de ${userName}`,
      details: JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging dependency permission change:', error);
  }
};

export const logDependencyUpdate = async (
  dependencyCode: string,
  dependencyName: string,
  changes: any,
  adminEmail: string
) => {
  try {
    const details = {
      dependencyCode,
      dependencyName,
      changes,
      action: 'Actualización de dependencia'
    };

    const auditData: AuditLog = {
      user_email: adminEmail,
      action: 'update',
      entity_type: 'dependency',
      entity_name: dependencyName,
      details: JSON.stringify(details)
    };

    await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/audit`, auditData);
  } catch (error) {
    console.error('Error logging dependency update:', error);
  }
};

export const compareTemplateChanges = (oldTemplate: any, newTemplate: any) => {
  const changes: any = {};
  
  // Comparar nombre
  if (oldTemplate.name !== newTemplate.name) {
    changes.name = {
      old: oldTemplate.name,
      new: newTemplate.name
    };
  }
  
  // Comparar descripción
  if (oldTemplate.file_description !== newTemplate.file_description) {
    changes.file_description = {
      old: oldTemplate.file_description,
      new: newTemplate.file_description
    };
  }
  
  // Comparar campos
  const oldFields = oldTemplate.fields || [];
  const newFields = newTemplate.fields || [];
  
  const fieldChanges: {
    added: any[];
    removed: any[];
    modified: any[];
  } = {
    added: [],
    removed: [],
    modified: []
  };
  
  // Campos agregados
  newFields.forEach((newField: any) => {
    const oldField = oldFields.find((f: any) => f.name === newField.name);
    if (!oldField) {
      fieldChanges.added.push(newField);
    } else {
      // Verificar si el campo fue modificado
      if (JSON.stringify(oldField) !== JSON.stringify(newField)) {
        fieldChanges.modified.push({
          name: newField.name,
          old: oldField,
          new: newField
        });
      }
    }
  });
  
  // Campos eliminados
  oldFields.forEach((oldField: any) => {
    const newField = newFields.find((f: any) => f.name === oldField.name);
    if (!newField) {
      fieldChanges.removed.push(oldField);
    }
  });
  
  if (fieldChanges.added.length > 0 || fieldChanges.removed.length > 0 || fieldChanges.modified.length > 0) {
    changes.fields = fieldChanges;
  }
  
  // Comparar productores
  const oldProducers = oldTemplate.producers || [];
  const newProducers = newTemplate.producers || [];
  
  const producerChanges: {
    added: any[];
    removed: any[];
  } = {
    added: newProducers.filter((np: any) => !oldProducers.find((op: any) => op._id === np._id)),
    removed: oldProducers.filter((op: any) => !newProducers.find((np: any) => np._id === op._id))
  };
  
  if (producerChanges.added.length > 0 || producerChanges.removed.length > 0) {
    changes.producers = producerChanges;
  }
  
  // Comparar dimensiones
  const oldDimensions = oldTemplate.dimensions || [];
  const newDimensions = newTemplate.dimensions || [];
  
  const dimensionChanges: {
    added: any[];
    removed: any[];
  } = {
    added: newDimensions.filter((nd: any) => !oldDimensions.find((od: any) => od._id === nd._id)),
    removed: oldDimensions.filter((od: any) => !newDimensions.find((nd: any) => nd._id === od._id))
  };
  
  if (dimensionChanges.added.length > 0 || dimensionChanges.removed.length > 0) {
    changes.dimensions = dimensionChanges;
  }
  
  return changes;
};

export const compareDependencyChanges = (oldDependency: any, newDependency: any) => {
  const changes: any = {};
  
  // Comparar responsable
  if (oldDependency.responsible !== newDependency.responsible) {
    changes.responsible = {
      old: oldDependency.responsible,
      new: newDependency.responsible
    };
  }
  
  // Comparar productores
  const oldProducers = oldDependency.producers || [];
  const newProducers = newDependency.producers || [];
  
  const producerChanges: {
    added: string[];
    removed: string[];
  } = {
    added: newProducers.filter((np: string) => !oldProducers.includes(np)),
    removed: oldProducers.filter((op: string) => !newProducers.includes(op))
  };
  
  if (producerChanges.added.length > 0 || producerChanges.removed.length > 0) {
    changes.producers = producerChanges;
  }
  
  return changes;
};

export const compareDependencyPermissions = (oldPermissions: string[], newPermissions: string[]) => {
  return {
    added: newPermissions.filter(np => !oldPermissions.includes(np)),
    removed: oldPermissions.filter(op => !newPermissions.includes(op))
  };
};
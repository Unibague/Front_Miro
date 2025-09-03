"use client";

import { useEffect } from 'react';
import { format, setGlobalDateI18n } from 'fecha';

const spanishLocale = {
  dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as [string, string, string, string, string, string, string],
  dayNamesShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as [string, string, string, string, string, string, string],
  monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as [string, string, string, string, string, string, string, string, string, string, string, string],
  monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as [string, string, string, string, string, string, string, string, string, string, string, string],
  amPm: ['AM', 'PM'] as [string, string]
};

const DateConfig = () => {
  useEffect(() => {
    setGlobalDateI18n(spanishLocale);
  }, []);

  return null;
};

const dateToGMT = (date: Date | string | number, formatDate: string = "MMM D, YYYY") => {
  const validDate = new Date(date);

  if (isNaN(validDate.getTime())) {
    console.warn("Fecha inválida en dateToGMT:", date);
    return ""; // o "Fecha inválida", o null
  }

  return format(new Date(validDate.getTime() + 5 * 60 * 60 * 1000), formatDate);
};

const dateNow = () => {
  const now = new Date();

  const offset = -5; // GMT-5
  const dateWithOffset = new Date(now.getTime() + offset * 60 * 60 * 1000);

  return new Date(new Date(dateWithOffset).toDateString());
};

export { dateToGMT, dateNow };
export default DateConfig;
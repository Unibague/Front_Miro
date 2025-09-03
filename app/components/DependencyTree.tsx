"use client";
import React from "react";
import { Accordion, Badge, Button, Group, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react"; // Import Mantine's warning icon
import Link from "next/link";
import Dependency from "../interfaces/Dependency";

interface Props {
  dependencies: Dependency[];
  showReports?: boolean; 
}

const DependencyTree = ({ dependencies, showReports = false }: Props) => { 
  const renderHierarchy = (dependencies: Dependency[]) => {
    return dependencies.map((dependency) => (
      <Accordion.Item key={dependency._id} value={dependency.dep_code}>
        <Accordion.Control>
          <p style={{ fontWeight: "bold" }}>{dependency.name}</p>
        </Accordion.Control>
        <Accordion.Panel>
          {/* Visualizers Indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>Líder(es):</strong>{" "}
             {dependency.visualizers.length > 0 ? 
              <ul>
                {dependency.visualizers.map((member) => (
                  <li key={member}>{member}</li>
                ))}
              </ul> : <Text> No definido </Text> }
          </div>

          {/* Members Indicator */}
          <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <strong>Miembros:</strong>
            {dependency.members.length > 0 ? (
              <ul>
                {dependency.members.map((member) => (
                  <li key={member}>{member}</li>
                ))}
              </ul>
            ) : (
              <span style={{ color: "red", display: "flex", alignItems: "center", gap: 5 }}>
                <IconAlertCircle size={16} color="red" /> Aún no han sido definidos
              </span>
            )}
          </div>

          {/* View Templates Button */}
          {/* Muestra el botón correcto según la página */}
          <Link href={`/dependency/children-dependencies/${showReports ? "reports" : "templates"}/${dependency._id}`}>
            <Button style={{ marginBottom: 20 }}>
              {showReports ? "Ver reportes de la dependencia" : "Ver plantillas de la dependencia"}
            </Button>
          </Link>

          {/* Recursive Accordion for Children */}
          {dependency.children.length > 0 && (
            <Accordion variant="contained">
              {renderHierarchy(dependency.children)}
            </Accordion>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    ));
  };

  return <Accordion variant="contained">{renderHierarchy(dependencies)}</Accordion>;
};

export default DependencyTree;

interface Dependency {
  _id: string;
  children: Dependency[];
  dep_code: string;
  dep_father: string;
  members: string[];
  name: string;
  responsible: string;
  visualizers: string[]
}

export default Dependency;

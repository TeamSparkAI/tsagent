import React from 'react';

interface AboutViewProps {
  title: string;
  description: React.ReactNode;
}

export const AboutView: React.FC<AboutViewProps> = ({ title, description }) => {
  return (
    <div className="about-view">
      <h2>{title}</h2>
      <div className="about-content">
        {description}
      </div>
    </div>
  );
}; 
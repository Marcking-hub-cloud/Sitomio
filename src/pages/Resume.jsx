import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { useScrollReveal } from '../hooks/useScrollReveal'

export default function Resume() {
  useScrollReveal()

  return (
    <div className="resume-page">
      <nav id="resume-nav">
        <Link to="/" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M19 12H5M5 12l6-6M5 12l6 6" />
          </svg>
          <span>Back</span>
        </Link>
        <ThemeToggle className="theme-toggle" />
      </nav>

      <main id="resume">
        {/* Header */}
        <header className="resume-header">
          <h1>Marco Strada</h1>
          <p className="resume-tagline">B.Sc. student in Chemistry · University of Milan</p>
          <div className="resume-contact-row">
            <a href="mailto:marco.strada2@studenti.unimi.it">marco.strada2@studenti.unimi.it</a>
            <span className="sep">·</span>
            <a href="https://www.linkedin.com/in/marco-strada-556180340/" target="_blank" rel="noopener">LinkedIn</a>
            <span className="sep">·</span>
            <a href="https://github.com/marcostrada" target="_blank" rel="noopener">GitHub</a>
          </div>
        </header>

        {/* About */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">About</h2>
          <p>Bachelor&apos;s student in Chemistry at the University of Milan, with a growing interest in organic chemistry,
            spectrophotometry methods, and biochemistry. Passionate about understanding molecular behaviour through
            analytical techniques and exploring the chemistry of living systems. Holds a certification in 
            <strong>Organometallic Catalysis in Sustainable Chemistry</strong> from the Technical University of Denmark (DTU).</p>
        </section>

        {/* Education */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">Education</h2>
          <div className="resume-entry">
            <div className="resume-entry-header">
              <h3>B.Sc. in Chemistry</h3>
              <span className="resume-date">Sep 2022 — Present</span>
            </div>
            <p className="resume-org">University of Milan (Università degli Studi di Milano)</p>
            <p>Coursework in organic chemistry, physical chemistry, analytical chemistry, biochemistry, and
              spectroscopic methods. Building a strong foundation in laboratory techniques and molecular analysis.</p>
          </div>

          <div className="resume-entry">
            <div className="resume-entry-header">
              <h3>Organometallic Catalysis in Sustainable Chemistry</h3>
              <span className="resume-date">Aug 2026</span>
            </div>
            <p className="resume-org">Technical University of Denmark (DTU)</p>
            <p>Certificate course covering the principles and applications of organometallic catalysis
              in the context of sustainable and green chemistry, including catalytic cycles, ligand design,
              and atom-economical transformations.</p>
          </div>
        </section>

        {/* Research Interests */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">Research Interests</h2>
          <div className="resume-interests">
            <div className="resume-interest">
              <h3>Organic Chemistry</h3>
              <p>Interested in reaction mechanisms, stereochemistry, and synthetic strategies. Enjoys solving
                retrosynthetic puzzles and understanding how molecular structure drives reactivity.</p>
            </div>
            <div className="resume-interest">
              <h3>Spectrophotometry Methods</h3>
              <p>Fascinated by UV-Vis, IR, and fluorescence spectroscopy as tools for molecular characterization.
                Exploring how absorption and emission data reveal structural and electronic information.</p>
            </div>
            <div className="resume-interest">
              <h3>Biochemistry</h3>
              <p>Curious about enzyme kinetics, protein structure, and the chemical processes that govern
                biological systems. Interested in the interface between organic chemistry and biology.</p>
            </div>
          </div>
        </section>

        {/* Experience */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">Experience</h2>
          <div className="loading-placeholder">
            <div className="loading-icon">⏳</div>
            <p className="loading-message">Currently acquiring experience...</p>
            <div className="loading-bar-track">
              <div className="loading-bar-fill"></div>
            </div>
            <p className="loading-subtext">ETA: Soon™ — check back after graduation</p>
          </div>
        </section>

        {/* Publications */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">Publications</h2>
          <div className="loading-placeholder">
            <div className="loading-icon">🧪</div>
            <p className="loading-message">Brewing first paper in the lab...</p>
            <div className="loading-bar-track">
              <div className="loading-bar-fill fill-slow"></div>
            </div>
            <p className="loading-subtext">Peer review is just a fancy word for &quot;patience&quot;</p>
          </div>
        </section>

        {/* Skills */}
        <section className="resume-section" data-aos="">
          <h2 className="resume-section-title">Skills</h2>
          <div className="resume-skills-grid">
            <div>
              <h3>Computational</h3>
              <p>Python · NumPy · Basic DFT (GAUSSIAN) · Molecular Visualization (Avogadro)</p>
            </div>
            <div>
              <h3>Experimental</h3>
              <p>Organic Synthesis · Spectroscopy (NMR, IR, UV-Vis) · Chromatography (HPLC, GC) · Titration Techniques</p>
            </div>
            <div>
              <h3>Languages</h3>
              <p>Italian (native) · English (C1)</p>
            </div>
          </div>
        </section>
      </main>

      <footer id="resume-footer">
        <p>© 2025 Marco Strada · Milan, Italy</p>
      </footer>
    </div>
  )
}

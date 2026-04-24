"""
Realistic hardcoded response used when DEMO_MODE is active (no API key).
PMIDs and Reactome IDs are real and link to actual records.
"""

from models.schemas import (
    Hypothesis,
    HypothesisResponse,
    PubMedAbstract,
    ReactomePathway,
    SuggestedExperiment,
)

DEMO_RESPONSE = HypothesisResponse(
    drug_name="[DEMO] imatinib",
    hypotheses=[
        Hypothesis(
            id=1,
            mechanism=(
                "Imatinib competitively occupies the ATP-binding pocket of BCR-ABL1 in its "
                "inactive (DFG-out) conformation, sterically blocking substrate phosphorylation. "
                "This prevents downstream activation of RAS/MAPK and PI3K/AKT survival pathways, "
                "triggering G1 arrest and mitochondrial apoptosis in BCR-ABL1-expressing cells."
            ),
            confidence_score=9,
            reasoning=(
                "Multiple independent lines of evidence support this mechanism. PMID 42001524 "
                "confirms BCR-ABL1 kinase domain occupancy drives therapeutic response. "
                "PMID 41599389 documents that kinase domain mutations (T315I, E255K) that disrupt "
                "imatinib binding cause resistance, directly linking pocket occupancy to efficacy."
            ),
            pubmed_abstracts=[
                PubMedAbstract(
                    pmid="42001524",
                    title="Discovery of [1,2,4]triazolo[1,5-a]pyrimidine-Imatinib Hybrids With Selective Cytotoxicity Against BCR-ABL1",
                    abstract=(
                        "Chronic myeloid leukemia treatment faces the challenge of resistance to BCR-ABL1 "
                        "tyrosine kinase inhibitors. To address this, triazolo-pyrimidine-imatinib hybrids "
                        "were synthesized and evaluated for selective cytotoxicity against BCR-ABL1-expressing "
                        "K562 cells. Lead compounds maintained inhibitory activity against T315I gatekeeper "
                        "mutants, supporting a direct kinase-occupancy mechanism."
                    ),
                    url="https://pubmed.ncbi.nlm.nih.gov/42001524",
                ),
                PubMedAbstract(
                    pmid="41599389",
                    title="Advances in Targeting BCR-ABL: Resistance Mutations and Next-Generation Inhibitors",
                    abstract=(
                        "Resistance to imatinib remains a therapeutic challenge, largely driven by point "
                        "mutations within the kinase domain of BCR-ABL1. The T315I gatekeeper mutation "
                        "abolishes hydrogen bonding with imatinib. Understanding the structural basis of "
                        "resistance has guided development of ponatinib and asciminib, which overcome "
                        "distinct resistance mechanisms."
                    ),
                    url="https://pubmed.ncbi.nlm.nih.gov/41599389",
                ),
            ],
            reactome_pathways=[
                ReactomePathway(
                    pathway_id="R-HSA-428890",
                    name="Role of ABL in ROBO-SLIT signaling",
                    url="https://reactome.org/PathwayBrowser/#/R-HSA-428890",
                ),
                ReactomePathway(
                    pathway_id="R-HSA-162582",
                    name="Signal Transduction",
                    url="https://reactome.org/PathwayBrowser/#/R-HSA-162582",
                ),
            ],
            suggested_experiments=[
                SuggestedExperiment(
                    tier="functional_rescue",
                    measurement_type="quantitative",
                    assay_type="BCR-ABL1 T315I rescue + imatinib dose-response",
                    primary_endpoint="IC50 (µM) by CellTiter-Glo viability; fold-shift vs. WT",
                    cell_line="K562 (BCR-ABL1 WT) and Ba/F3-T315I (gatekeeper mutant)",
                    controls=["Ponatinib 10 nM (positive control, active on T315I)", "DMSO vehicle (negative control)"],
                    replicates="n=3 biological replicates, duplicate wells each",
                    rationale="If imatinib acts solely via BCR-ABL1 ATP pocket occupancy, T315I cells should show >50-fold IC50 shift, directly proving the binding-dependent mechanism.",
                ),
                SuggestedExperiment(
                    tier="reproducibility",
                    measurement_type="quantitative",
                    assay_type="Phospho-CrkL flow cytometry",
                    primary_endpoint="% pCrkL-positive cells at 1 µM imatinib vs. untreated (MFI ratio)",
                    cell_line="K562",
                    controls=["Dasatinib 10 nM (positive, pan-BCR-ABL inhibitor)", "Unstimulated K562 (basal pCrkL)"],
                    replicates="n=3 biological replicates",
                    rationale="CrkL phosphorylation is a validated pharmacodynamic biomarker for BCR-ABL1 activity; orthogonal to viability assay.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="quantitative",
                    assay_type="Cellular thermal shift assay (CETSA)",
                    primary_endpoint="Tm shift (°C) of BCR-ABL1 vs. vehicle by Western blot band intensity",
                    cell_line="K562 lysate",
                    controls=["Vehicle DMSO (no shift expected)", "Imatinib 10 µM (maximal shift)"],
                    replicates="n=3 technical replicates per temperature point (8-point curve)",
                    rationale="CETSA directly measures target engagement in cells; confirms imatinib physically binds BCR-ABL1 at pharmacologically relevant concentrations.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="quantitative",
                    assay_type="Apoptosis kinetics (Annexin V / 7-AAD)",
                    primary_endpoint="% Annexin V+ cells at 24/48/72 h; EC50 of apoptosis induction (µM)",
                    cell_line="K562 vs. K562-imatinib-resistant (T315I)",
                    controls=["Staurosporine 1 µM (pan-apoptosis positive)", "Untreated K562 (baseline apoptosis)"],
                    replicates="n=3 biological replicates per time point",
                    rationale="Time-resolved apoptosis quantification distinguishes cytostatic from cytotoxic action and links kinase inhibition to the downstream cell death mechanism.",
                ),
            ],
        ),
        Hypothesis(
            id=2,
            mechanism=(
                "In addition to its primary BCR-ABL1 target, imatinib potently inhibits c-KIT "
                "(KIT) and PDGFR-α/β at clinically achievable plasma concentrations. In BCR-ABL1-"
                "expressing cells, KIT co-activation sustains SCF-dependent survival signaling through "
                "PI3K that partially bypasses BCR-ABL1 inhibition, contributing to incomplete response "
                "and early resistance in patients with high KIT co-expression."
            ),
            confidence_score=6,
            reasoning=(
                "Imatinib's polypharmacology against KIT and PDGFR is well-documented structurally. "
                "PMID 41570583 reports novel BCR-ABL inhibitors with altered selectivity profiles, "
                "highlighting the importance of off-target kinase coverage. The clinical relevance of "
                "KIT co-inhibition in CML specifically is less established than in GIST, warranting "
                "moderate confidence."
            ),
            pubmed_abstracts=[
                PubMedAbstract(
                    pmid="41570583",
                    title="Discovery and mechanistic insights of novel Piperlongumine analogs as potent Bcr-Abl inhibitors",
                    abstract=(
                        "In the exploration of potential anticancer candidates with novel mechanisms of action, "
                        "a series of novel piperlongumine analogs were synthesized and evaluated as BCR-ABL "
                        "inhibitors. Selectivity profiling against KIT and PDGFR revealed differential "
                        "off-target engagement, suggesting that polypharmacology may contribute to the "
                        "overall antileukemic effect observed in cellular models."
                    ),
                    url="https://pubmed.ncbi.nlm.nih.gov/41570583",
                ),
            ],
            reactome_pathways=[
                ReactomePathway(
                    pathway_id="R-HSA-9680350",
                    name="Signaling by CSF1 (M-CSF) in myeloid cells",
                    url="https://reactome.org/PathwayBrowser/#/R-HSA-9680350",
                ),
                ReactomePathway(
                    pathway_id="R-HSA-186763",
                    name="Downstream signal transduction",
                    url="https://reactome.org/PathwayBrowser/#/R-HSA-186763",
                ),
            ],
            suggested_experiments=[
                SuggestedExperiment(
                    tier="functional_rescue",
                    measurement_type="quantitative",
                    assay_type="SCF ligand rescue of imatinib-treated K562",
                    primary_endpoint="% rescue of viability (CellTiter-Glo) vs. imatinib-only arm at 72 h",
                    cell_line="K562 (endogenous KIT expression confirmed by flow)",
                    controls=["Anti-KIT neutralizing Ab (positive, blocks rescue)", "BSA vehicle (negative control for SCF)"],
                    replicates="n=3 biological replicates, SCF dose range 10–100 ng/mL",
                    rationale="If KIT co-activation contributes to resistance, exogenous SCF should rescue >20% viability in imatinib-treated cells; anti-KIT Ab should block this rescue.",
                ),
                SuggestedExperiment(
                    tier="reproducibility",
                    measurement_type="quantitative",
                    assay_type="KIT phosphorylation Western blot (pY703)",
                    primary_endpoint="pKIT/total KIT ratio by densitometry (ImageJ) at 1 µM imatinib",
                    cell_line="K562 + SCF 50 ng/mL stimulation",
                    controls=["Imatinib 10 µM (maximal KIT inhibition)", "SCF alone without imatinib (maximal pKIT)"],
                    replicates="n=3 biological replicates",
                    rationale="Confirms imatinib engages KIT in the same cells where BCR-ABL1 is inhibited, establishing co-target pharmacodynamics.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="quantitative",
                    assay_type="KIT CRISPR knockout + imatinib sensitivity",
                    primary_endpoint="IC50 shift (fold-change) in KIT-KO vs. parental K562",
                    cell_line="K562 KIT-KO (two independent sgRNAs)",
                    controls=["Non-targeting sgRNA control", "Parental K562"],
                    replicates="n=3 biological replicates per clone, 2 independent KO clones",
                    rationale="Genetic removal of KIT isolates its contribution to imatinib sensitivity independent of pharmacological off-target effects.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="quantitative",
                    assay_type="Kinase selectivity panel (KINOMEscan or NanoBRET)",
                    primary_endpoint="% inhibition at 1 µM imatinib across 50-kinase panel; Kd (nM) for KIT vs. BCR-ABL1",
                    cell_line="Biochemical assay (recombinant kinases)",
                    controls=["Staurosporine 1 µM (pan-kinase positive)", "DMSO vehicle"],
                    replicates="Duplicate binding measurements per kinase",
                    rationale="Quantifies the selectivity window between BCR-ABL1 and KIT inhibition at clinically relevant imatinib concentrations.",
                ),
            ],
        ),
        Hypothesis(
            id=3,
            mechanism=(
                "Imatinib exposure disrupts autophagic flux in BCR-ABL1+ cells by indirectly "
                "reducing AMPK activity (through decreased AMP:ATP ratio as cells exit active "
                "proliferation) and by inhibiting lysosomal acidification. This creates a "
                "cytoprotective autophagy block that limits apoptosis and may underlie the "
                "persistence of BCR-ABL1+ stem cells despite kinase inhibition."
            ),
            confidence_score=4,
            reasoning=(
                "The link between imatinib and autophagy is mechanistically plausible but the "
                "evidence is conflicting — some reports show autophagy induction, others show "
                "inhibition. PMID 41871455 documents granule integrity disruption in myeloid cells "
                "under drug treatment, consistent with lysosomal perturbation but not directly "
                "testing imatinib. This hypothesis warrants experimental investigation rather than "
                "confident assertion."
            ),
            pubmed_abstracts=[
                PubMedAbstract(
                    pmid="41871455",
                    title="Perturbation of azurophilic granule integrity drives NLRP3-independent IL-1β processing in myeloid cells",
                    abstract=(
                        "Interleukin 1-beta (IL-1β) is an inflammatory cytokine produced by myeloid cells "
                        "in response to infection or sterile tissue damage. Lysosomal and granule membrane "
                        "permeabilization was found to be sufficient to trigger IL-1β processing via "
                        "cathepsin B release, independent of NLRP3 inflammasome activation. These findings "
                        "implicate lysosomal integrity as a key node in myeloid cell stress responses."
                    ),
                    url="https://pubmed.ncbi.nlm.nih.gov/41871455",
                ),
            ],
            reactome_pathways=[
                ReactomePathway(
                    pathway_id="R-HSA-5690714",
                    name="CD22 mediated BCR regulation",
                    url="https://reactome.org/PathwayBrowser/#/R-HSA-5690714",
                ),
            ],
            suggested_experiments=[
                SuggestedExperiment(
                    tier="functional_rescue",
                    measurement_type="quantitative",
                    assay_type="Autophagy flux rescue with rapamycin + imatinib co-treatment",
                    primary_endpoint="LC3-II/LC3-I ratio by Western blot (densitometry) ± chloroquine chase",
                    cell_line="K562",
                    controls=["Chloroquine 50 µM alone (blocks flux, LC3-II accumulation)", "DMSO vehicle (basal flux)"],
                    replicates="n=3 biological replicates",
                    rationale="If imatinib blocks autophagic flux, chloroquine chase should show no additional LC3-II accumulation vs. imatinib alone; rapamycin co-treatment tests whether restored autophagy affects viability.",
                ),
                SuggestedExperiment(
                    tier="reproducibility",
                    measurement_type="quantitative",
                    assay_type="GFP-LC3 puncta quantification by confocal imaging",
                    primary_endpoint="Mean GFP-LC3 puncta per cell (n>50 cells per condition) at 24 h",
                    cell_line="K562 stably expressing GFP-LC3",
                    controls=["Rapamycin 100 nM (autophagy induction, puncta increase)", "Bafilomycin A1 100 nM (flux block, puncta accumulate)"],
                    replicates="n=3 biological replicates, ≥3 fields per replicate",
                    rationale="Orthogonal imaging-based autophagy readout that distinguishes induction from flux block without relying on Western blot quantification.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="quantitative",
                    assay_type="LysoSensor / LysoTracker flow cytometry",
                    primary_endpoint="Median LysoSensor fluorescence intensity (MFI) at 1 µM imatinib vs. vehicle",
                    cell_line="K562",
                    controls=["Bafilomycin A1 100 nM (lysosomal alkalinization positive control)", "DMSO vehicle"],
                    replicates="n=3 biological replicates",
                    rationale="Directly tests whether imatinib perturbs lysosomal pH, the proposed mechanistic basis for autophagy disruption.",
                ),
                SuggestedExperiment(
                    tier="mechanistic",
                    measurement_type="qualitative",
                    assay_type="Transmission electron microscopy (TEM) of autophagic vacuoles",
                    primary_endpoint="Presence/absence and morphology of autolysosomes vs. autophagosomes",
                    cell_line="K562 at 48 h imatinib 1 µM",
                    controls=["Chloroquine-treated (blocked flux, expected accumulation of autophagosomes)", "Untreated K562"],
                    replicates="2 independent experiments, ≥20 cell cross-sections scored per condition",
                    rationale="TEM provides ultrastructural resolution to distinguish autophagosome accumulation (flux block) from reduced autophagosome formation (induction failure).",
                ),
            ],
        ),
    ],
    disclaimer=(
        "DEMO MODE — this response uses hardcoded example data, not real AI-generated hypotheses. "
        "Add a GEMINI_API_KEY to .env for live analysis. "
        "All PubMed and Reactome links are real records."
    ),
)

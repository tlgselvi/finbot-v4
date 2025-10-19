/**
 * Goal Tracking Component Tests
 * Comprehensive test suite for goal tracking components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import '@testing-library/jest-dom';

import GoalTrackingDashboard from './GoalTrackingDashboard';
import GoalCard from './GoalCard';
import GoalWizard from './GoalWizard';
import MilestoneTracker from './MilestoneTracker';
import GoalInsights from './GoalInsights';
import AchievementCelebration from './AchievementCelebration';

// Mock the custom hook
jest.mock('../../hooks/useGoalTracking', () => ({
  useGoalTracking: () => ({
    createGoal: jest.fn().mockResolvedValue({
      id: 'test_goal',
      title: 'Test Goal',
      description: 'Test Description',
      category: 'savings',
      targetAmount: 10000,
      currentAmount: 5000,
      targetDate: new Date('2024-12-31'),
      priority: 'high',
      status: 'in_progress',
      monthlyContribution: 500,
      autoContribute: true,
      tags: ['test'],
      milestones: [],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-10-18')
    }),
    updateGoal: jest.fn().mockResolvedValue(true),
    deleteGoal: jest.fn().mockResolvedValue(true),
    getGoalRecommendations: jest.fn().mockResolvedValue([]),
    calculateGoalProjection: jest.fn().mockResolvedValue({
      projectedCompletionDate: new Date('2024-12-31'),
      requiredMonthlyContribution: 500,
      probabilityOfSuccess: 0.85,
      alternativeScenarios: []
    }),
    addFundsToGoal: jest.fn().mockResolvedValue(true),
    completeMilestone: jest.fn().mockResolvedValue(true),
    getGoalAnalytics: jest.fn().mockResolvedValue({}),
    isLoading: false,
    error: null
  })
}));

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />
}));

// Mock react-circular-progressbar
jest.mock('react-circular-progressbar', () => ({
  CircularProgressbar: ({ value, text }: any) => (
    <div data-testid="circular-progressbar" data-value={value}>
      {text}
    </div>
  ),
  CircularProgressbarWithChildren: ({ children }: any) => (
    <div data-testid="circular-progressbar-with-children">{children}</div>
  ),
  buildStyles: () => ({})
}));

const theme = createTheme();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        {component}
      </LocalizationProvider>
    </ThemeProvider>
  );
};descr
ibe('GoalTrackingDashboard', () => {
  test('renders dashboard with main components', () => {
    renderWithProviders(<GoalTrackingDashboard />);
    
    expect(screen.getByText('Goal Tracking')).toBeInTheDocument();
    expect(screen.getByText('AI-assisted financial goal setting and progress monito
});;
  });ument()eInTheDoc.toBinner out')) Dyour reward:ime for getByText('Treen.expect(sc    );
heDocument(')).toBeInT5,000""First $ched \'ve reaext('Youeen.getByTxpect(scr;
    eent()eDocumBeInTh')).toeved! 🎯ne Achixt('Mileston.getByTect(scree   expe  
   );
    />
  one}
    ilestne={m    milesto    
ockProps}        {...mon 
 tCelebrati <Achievemen(
     hProviderserWit  rend
  ;
t'
    } ou'Dinner reward:      -15'),
24-06('20atenew DpletedAt:   com
    ,rueted: t  comple   
 -06-30'),24te('20: new DateetDa    targ: 5000,
  tAmountrge
      tast $5,000',itle: 'Fir t,
     estone_1'    id: 'mil = {
  st milestonecon  > {
  , () = provided' prop isstoneiletion when m celebratoneesmilt('shows es;

  t})
  ();nCalledHaveBeelose).tops.onCect(mockPro
    exp;
    tton)nueBucontilick(reEvent.ce');
    fi('ContinugetByTexton = screen.inueButtst cont    con;
    
} />)ockPropstion {...mebraentCel(<AchievemdersWithProvi   render () => {
 s clicked',ue i continwhenes dialog st('clos te;

 })led();
  eBeenCalt).toHavd.writeTexoaror.clipbect(navigat 
    exp);
   shareButtonnt.click(fireEve');
    cesst('Share SucetByTexeen.gtton = scrareBu  const sh 
      />);
..mockProps}ation {.ntCelebr<Achievemeiders(rWithProvnde

    re  });      }
  
t.fn()iteText: jes       wr {
 clipboard:
      igator, {assign(nav Object.  d
 .clipboargator Mock navi
    //) => { (ity',alre functiondles sha('han

  testt();
  });eneDocumnThs')).toBeIgeBadement ('AchievgetByTextct(screen. expe
    
   Props} />);..mockbration {.vementCeles(<AchiehProviderrenderWit    () => {
t badges', hievemenisplays ac
  test('d

  });t();InTheDocumend')).toBent SaveAmou('etByTexteen.g expect(scr  cument();
 eDo).toBeInTht('$15,000')etByTexcreen.g  expect(s
       />);
kProps}on {...mocntCelebratiAchievemeoviders(<erWithPr
    rend{) => ', (t statisticsvemenhieacs st('show

  te);
  });cument(Do)).toBeInThemplete!'is now co" undgency Fmerxt('"EgetByTeeen.cr expect(snt();
   heDocume🎉')).toBeInTd!  Completeoalt('GyTexreen.getBexpect(sc
    
     />);..mockProps} {.brationentCeles(<AchievemviderWithPronder  re
  n', () => {pletioal comg for goation dialoelebrenders c('rstte
  
n()
  };st.fnClose: je  ooal,
   goal: mockGtrue,
     open: {
  kProps = moconst   };

  c-10-18')
('2024t: new Date  completedA
  8'),e('2024-10-1: new DatupdatedAt'),
    01e('2024-01-: new Dat  createdAt],
   tags: [ue,
   ibute: tr autoContr,
   500bution: Contri    monthlyes: [],
   mileston
  const,eted' as: 'compl
    statust,l' as consriticariority: 'c1'),
    pe('2024-12-3at: new DtargetDate
    00, 150mount: currentA
   unt: 15000,Amorget  tat,
  ns as coemergency'y: 'egorn',
    catptioest Description: 'Tscri dend',
   ncy Fue: 'Emergetl',
    ti_goalst id: 'te{
   al = t mockGo
  cons => {on', ()elebratintCe('Achieveme;

describ});
})ment();
  nTheDocu).toBeI Pace')argetxt('Behind Ten.getByTeect(screexppace
    nd  behiabout beingning how warhould s S//
        />);
 oal}ndGl={behi goasights<GoalInthProviders(  renderWi};
    
  e
    deadlinn ) // Soo11-30'2024-: new Date('ate  targetD    ribution
 low cont Very: 50, //onlyContributi   monthkGoal,
   moc   ...
   hindGoal = {   const be=> {
 tus', ()  on goal stabasedes insights ('generat

  test);
  });nt(TheDocume)).toBeInrt'haarea-ctId('ByTescreen.getexpect(s  ;
    
  al} />)oal={mockGos g<GoalInsightrs(ithProvide   renderW) => {
 art', (rojection chws p'sho
  test(  });
);
ent(InTheDocumns')).toBemmendatioRecoext('AI en.getByTect(scre
    exp
    );Goal} />={mocks goalGoalInsighthProviders(<it   renderW) => {
 ns', (tio recommendasplays AIest('di
  t
  });
/10000 = 30%00nt(); // 30umeheDoceInToB%')).t('30.getByTextreenct(scxpe
    
    e);l} />={mockGoas goalalInsightGoroviders(<hPderWitren {
    e', () =>percentagogress pr'shows ;

  test(
  })nt();DocumeoBeInTheection')).togress ProjyText('Pren.getBpect(scre;
    exent()eDocumoBeInThce')).t Performanoalt('GTexeen.getBy  expect(scrent();
  heDocumInTions')).toBe & Project'AI Insightsn.getByText(screexpect(    
    e />);
ockGoal}ts goal={mInsighGoalders(<WithProviender  r () => {
  metrics',mance forhts with perinsignders  test('re
 )
  };
024-10-18''2: new Date(atedAt),
    upd-01'ate('2024-01: new DtedAt creags: [],
     taalse,
  ibute: fontr autoC0,
   tion: 20ntribulyCo
    month: [],nesstoilet,
    m as consogress'atus: 'in_pr
    stconst,high' as riority: '  p  2-31'),
4-1e('202at new DetDate: targ 3000,
   Amount:nt   curret: 10000,
 argetAmoun t const,
   s' asaving: 'sgory cateion',
   criptest Desn: 'T descriptioGoal',
   Test  title: 'l',
   _goa 'test= {
    id:kGoal t moc
  cons=> {ghts', () be('GoalInsi

descri;
}); })t();
 InTheDocumen 🎉')).toBe Achieved!estone'MilyText(een.getBexpect(scrion
    celebratould show    // Sh
 n);
    ButtoarkCompleteent.click(m    fireEvmplete');
 Cot('Markn.getByTextton = screekCompleteBu const marte
   ne compleMark milesto   //   
 
  );} />ckPropser {...morack(<MilestoneTrsrWithProvide  rende () => {
  tion',mplemilestone co on logation diashows celebrest(';

  tent();
  })InTheDocum')).toBeMilestone New yText('AddgetB(screen.ect
    exp);
    Buttonclick(add  fireEvent.
  estone');Add MiletByText('n = screen.gt addButto
    cons
    ); />ockProps}.mcker {..MilestoneTrahProviders(< renderWit=> {
   alog', () ne diilestoens add mst('op;

  te});
  }))
    (Dateny: expect.a completedAt   true,
  mpleted:     co{
  stone_3', ith('mileCalledW).toHaveBeenstonepdateMileProps.onUt(mock
    expec    Button);
markCompletelick(ireEvent.c
    fomplete');xt('Mark CtByTe= screen.getton pleteBuarkCom const mete
    it complne and markmilesto incomplete ind the// F    />);
    
ckProps} ...mooneTracker {s(<MilestviderProenderWith
    r() => {lete', mp as co milestonekingallows mar
  test(');
ment();
  }ocuoBeInTheDrters')).tThree Quat('Texen.getByct(scre   expeument();
 toBeInTheDoc')).Pointfway aletByText('Hreen.gscexpect(nt();
    InTheDocume500')).toBe('First $2,.getByTextxpect(screen
    esstoneileeted mhow compl should    // S;
    
>)rops} /ockPker {...mneTractoers(<MilesidWithProv render
    => {s', () statuth correctr wistone steppesplays mile'dist( });

  teument();
 toBeInTheDocrters')).Quaree estone: Thext MilByText('N(screen.get expect
   cument();InTheDoss')).toBetone Progre'MilesetByText(n.gree   expect(sc);
    
 } />psockPro{...mTracker toners(<MilesidenderWithProv re{
   ew', () => erviess ovtone progrshows milestest('
  );
t();
  }cumentoBeInTheDo500')).st $2,ext('FirByTreen.getct(sc expe of 3
   ed outet // 2 complDocument();henTtoBeIt('2/3')).n.getByTexct(screeexpe    ();
heDocumenteInTones')).toBext('Milestreen.getByT(scect  exp
  >);
    ockProps} /acker {...mlestoneTr<Miers(Providith renderW) => {
   ogress', (h prtracker witstone rs miletest('rende
  ();
  });
learAllMocks.c
    jest) => {oreEach(( bef};

 )
  fn(stone: jest.Mile   onUpdateGoal,
 mock  goal: 
  {kProps = st moc

  con-18')
  };102024-new Date('t: datedA1'),
    up01-0te('2024-new DacreatedAt: ,
      tags: []
  te: true,ribuautoCont 500,
    ibution:hlyContr   mont],
        }
 lse
  ompleted: fa
        c11-30'),te('2024-Dae: new Dat   target   ,
  500getAmount: 7 tar,
       Quarters' 'Three itle:      t
  estone_3',il     id: 'm  {
   },
    0')
      '2024-09-2e(att: new DpletedA  comue,
       trmpleted:       co-30'),
 24-09Date('20 new rgetDate:
        taount: 5000,rgetAm ta
       way Point',: 'Half   title   e_2',
  : 'mileston
        id,
      {   }  ')
 -154-06ew Date('202mpletedAt: n
        coted: true,    comple,
    -30')te('2024-06ate: new DargetD    ta  2500,
  getAmount: tar        ,500',
irst $2e: 'F   titl   tone_1',
  : 'miles       id      {
 : [
 milestones
   s const,ress' a 'in_prog  status:s const,
  h' arity: 'hig  prio
  -12-31'),('2024Dateate: new getD tar
   00,tAmount: 60
    curren0,unt: 1000tAmo
    targeonst,s cgs' asavincategory: '',
    riptionDesc'Test :  description
   ',t Goale: 'Testl tioal',
   est_g: 't
    id {mockGoal ={
  const ) =>  (r',oneTracke'Milestdescribe(
);
});
d();
  }enCalle.toHaveBes.onSubmit)Propt(mock  expec
  ton);
    (createButt.clickEven);
    firee Goal'atByText('Cre screen.getButton =nst create
    coeate goall step - crina  // F    
tton);
  ntinueBunt.click(covefireE;
    tinue')yText('Con.getB = screenutton  continueB);
    
  eButtoninuick(contclt.Evenfireue');
    ('ContintByText = screen.geueButton let continsteps
   rough ate th Navig   //);
    
 ateencyTemplergk(emvent.clic
    fireEund'); Fcy'Emergenxt(een.getByTe scrTemplate =cyen emergnstte
    co templaect/ Sel  
    /s} />);
  ...mockPropWizard {ders(<GoaloviithPr renderW
   , () => {tep'final ss goal on est('create

  t
  });ocument();eDTh')).toBeInommendationsRecI tByText('Acreen.get(spec
    ex
    on);tinueButtconk(t.clicireEven;
    f')ueontintByText('Cen.gereutton = sceBonst continu 3
    co stepinue tnt   // Co    
 late);
Temprgencyemelick(t.cireEven;
    fd')ency FunyText('Emergn.getBscreete = gencyTemplaemer
    const atao-fill de to autlat tempSelect
    // ;
    ckProps} />)d {...mos(<GoalWizarProviderenderWith=> {
    r() ep 3', in stns mendatiows AI recomest('sho

  t});t();
  nTheDocumenine')).toBeImelTarget & Ti('Set Textscreen.getBy  expect(dation
   due to valin step 2 od still be Shoul    
    //
on);continueButtt.click(   fireEveninue');
 Text('Contscreen.getByeButton = ontinuconst c
    d fieldsireg requut fillintinue withoconto / Try     
    /h);
tFromScratclick(starireEvent.c');
    f ScratchStart fromgetByText('= screen.FromScratch onst start   clly
 nua 2 maGo to step   
    // } />);
 ..mockPropslWizard {.Goars(<rovideWithPder  ren> {
  , () =elds'ed fis requirlidateva  test('
  });

t();TheDocumend')).toBeIn Funcy('EmergenlayValuetByDisp.geect(screen
    expcument();.toBeInTheDoTimeline'))& Target ByText('Set een.getexpect(scr
     to step 2ld move/ Shou    
    /Template);
ergencyick(emclreEvent.;
    fincy Fund')ext('Emergeen.getByTlate = scrempemergencyTeonst ate
    cpl a tem // Select 
      ops} />);
ockPrWizard {...ms(<GoalovidererWithPrnd   re () => {
 ps',ard ste wizsses throughogre'prt(

  tes();
  });cumentnTheDooBeIent')).town Paym('House Den.getByTextect(scre
    expcument();toBeInTheDoFund')).y mergencetByText('Ecreen.g  expect(snt();
  DocumetoBeInThe Type')).oose Goal'ChetByText(reen.g(scexpect   ument();
 eInTheDoc).toBWizard')('AI Goal en.getByTextct(scre expe  
    />);
  .mockProps}d {..izar<GoalWroviders(rWithPdeen{
    r, () => ates' templ wizard withnders goalt('re

  tes});
  Mocks();earAll jest.cl
   Each(() => {re befo};

   
jest.fn()  onSubmit: fn(),
  lose: jest.   onCn: true,
 ope    
ps = {Prost mock  con', () => {
ardbe('GoalWiz

descri);  });
}
);
    }n_progress': 'i status6000,
     Amount:     currentth({
  ledWieBeenCaldate).toHavProps.onUpckexpect(mo  
    utton);
  mitBt.click(sub    fireEveni });
s/und/add fe: nam, { on'uttByRole('bn.geton = screet submitButtns   co
 // Submit    
     });
 }00'10: { value: 'ut, { targettInphange(amoun fireEvent.c);
   ount to Add'abelText('AmgetByLn.screeut = mountInp
    const ater amountEn  
    // 
  Button);ck(addFundsEvent.cli fire);
   d Funds''AdgetByText(en.n = screuttost addFundsB con  ds dialog
 d funpen ad    // O
/>);
    ockProps} rd {...mers(<GoalCaWithProvid   render
 ) => {onality', (functiadd funds st('handles   te

t();
  });eDocumeneInTh)).toBk Complete'ext('MargetByTreen.  expect(sc
  ent();heDocumBeInToal')).to('Pause GextyTreen.getBpect(sc
    exocument();toBeInTheDt Goal')).'Edixt(en.getByTect(screexpe   ;
    
 ton)ck(moreBut.cliEvent fire);
   ('more'tByLabelTextscreen.geButton = const more
    
    ps} />);..mockPrord {.s(<GoalCaroviderrenderWithP> {
    d', () =s clicketon i butnu when moreontext meshows ctest('

  }
  });ed();
    llCa).toHaveBeenonSelectckProps.  expect(mocard);
    Event.click(fire
       if (card) {  
 );
    v'osest('dit Goal').clt('TesyTexeen.getB scr                
 || "button"]')=role'[l').closest(t Goaxt('TesgetByTereen.t card = scns  co
     ops} />);
 ...mockPr {ardrs(<GoalCithProvidenderW re
   => {() licked', card is cwhen Select  ontest('calls);

  ent();
  }BeInTheDocum).to Goal')nds to TestAdd FuyText('creen.getBxpect(s 
    e);
   undsButtonlick(addFfireEvent.cnds');
    t('Add FuTexeen.getBycr sutton = addFundsB
    const
    >);ps} /...mockProCard {al(<GoithProvidersnderW{
    re) => , (s clicked'utton in balog whefunds didd opens a('  test

();
  });DocumentInThe')).toBe('AutoByTextett(screen.g    expec;
ment()BeInTheDocu).tot('$500')yTexen.getBct(scre  expe    
  } />);
ckPropsard {...mos(<GoalCroviderthPenderWi {
    rtor', () =>ndicaith auto in wtiotribuconmonthly 'shows 
  test(;
t();
  })heDocumenInTtone')).toBeMilesd SecontByText('en.get(scre
    expecment();BeInTheDocutone')).ext MilestoetByText('Ncreen.gxpect(s 
    e
   Props} />);d {...mockoalCarrs(<GthProviderWi
    rendeon', () => {tirmaestone infoys next mil('displa
  test
  });
00 = 50%// 5000/100ocument(); InTheD')).toBetByText('50%ct(screen.ge  
    expe
  />);ockProps} Card {...mers(<GoalthProviderWirend) => {
    entage', (rrect perccoss bar with rogre'shows pest(
  t});
ent();
  InTheDocumess')).toBe('In Progrn.getByTextxpect(scree
    eeDocument();oBeInTh)).th't('hig.getByTex(screenct expet();
   ocumenInTheD).toBe'$10,000')ext(tByTeen.gescr
    expect(t();eDocumen)).toBeInThription' descest goalxt('Tn.getByTeect(scree exp();
   umentInTheDoc)).toBeGoal'ext('Test en.getByTect(scre
    exp  >);
   /ops}d {...mockPr(<GoalCarithProvidersenderW=> {
    rion', () format inctwith corre goal card t('renders});

  tess();
  rAllMockst.cleaje
     {(() =>ach
  beforeE)
  };
ct: jest.fn(le,
    onSee: jest.fn()Delet    on(),
fnst.date: je
    onUp mockGoal,
    goal:ckProps = {nst mo};

  co18')
  ('2024-10-ate: new DdatedAt    up'),
('2024-01-01 DateeatedAt: new],
    crnt'['importa
    tags: true,ntribute: oCo    aut500,
ution: thlyContribon
    m], }
         d: false
mplete      co9-30'),
  Date('2024-0ew rgetDate: n       ta
 nt: 5000,rgetAmouta       
 estone',Milnd co 'Se     title:
   _2', 'milestone
        id:,
      {')
      }2024-06-15 new Date('etedAt:  complue,
      ted: tromple
        c24-06-30'),w Date('20neargetDate: ,
        t2500ount: etAm      targone',
  stlerst Mile: 'Fi   tit',
     e_1 'mileston  id:  {
        s: [
  ilestonet,
    ms' as cons 'in_progresstatus:,
    ' as constighty: 'h
    priori2-31'),24-1new Date('20rgetDate:   ta 5000,
  ount:currentAm  : 10000,
  argetAmountst,
    ts conavings' acategory: 's,
    cription'est goal desption: 'T   descrist Goal',
  'Te   title:
 test_goal',{
    id: 'al = const mockGo() => {
  rd', ibe('GoalCa);

descr
  });
}ocument();eInTheDb).toBfa   expect(goal');
 ext('add LabelTscreen.getByb =  const fa    
   );
ashboard />oalTrackingDiders(<GnderWithProv re> {
   utton', () =ng action bplays floatiest('dis

  t
  });
    });ocument();InTheDl/i)).toBegoaerdue /ovgetByText(ect(screen. exp{
     => aitFor(() ait w
    aw  >);
  rd /ckingDashboaraalTGoiders(<derWithProv
    rensync () => {, als'rdue goavealerts for o'shows est(;

  t;
  })   })cument();
 eInTheDo.toBment')).notPayown se Dxt('HouyTequeryBen.ret(sc     expect();
 nTheDocumend')).toBeIy Funrgencxt('EmeTereen.getByxpect(sc> {
      eitFor(() = wa
    await fund goaly emergency show onlhould   // S
    
 ;encyOption)merglick(ereEvent.c');
    fi'EmergencyetByText(n.g= screegencyOption st emer  
    con);
  ilterryFegoouseDown(cat.mireEvent   fory');
 xt('CategelTeyLabreen.getBilter = sccategoryF const ter
   gory filate c
    // Open);

    }cument();oBeInTheDo.tund'))ncy F'EmergeByText(screen.get     expect(r(() => {
 await waitFod
    loa goals to  for Wait   
    //oard />);
 Dashbing<GoalTrackhProviders(enderWit> {
    rsync () =egory', ay cats goals bt('filter;

  tes })ment();
 eInTheDocuzard')).toBal Wi'AI GoText(creen.getBy  expect(s
    
  oalButton);newGick(ent.clfireEv    Goal');
ByText('New et screen.glButton = newGoaconst
    
    rd />);oahbrackingDasers(<GoalThProvidderWit    ren{
) => cked', (tton is clial bu when new gogoal wizardtest('opens  });

      });
 
eDocument();toBeInTh).gs')ement Savin'Retirxt(tByTen.gecreeexpect(s();
      entDocumhen')).toBeInTcatioVaropean Text('EuByt(screen.getpec;
      exument()heDoctoBeInTayment')).ouse Down PtByText('Hscreen.get(    expecent();
  umoBeInTheDoc.t'))rgency Fund('EmetByTexten.geexpect(scre     
 {r(() => await waitFo
     />);
    rdboangDashackis(<GoalTriderrovrenderWithP> {
    () =c ynoad', asinitial ln als o goshows samplest('te
  
  });
();umentnTheDoceIgs')).toBthly SavinyText('Monreen.getB expect(sc  cument();
 toBeInTheDohieved')).ones AcMilestText('en.getByret(sc
    expeceDocument();ThBeInls')).toctive Goa('AextetByTen.g(scre
    expectDocument();)).toBeInThegress'l ProText('Overalcreen.getBy    expect(s
    
 />);hboardasTrackingDviders(<GoalProithrW rende() => {
   ew cards', overviard plays dashboest('dis

  t();
  });TheDocumentl')).toBeIn GoatByText('Newn.geect(scree
    expument();InTheDoc.toBering'))
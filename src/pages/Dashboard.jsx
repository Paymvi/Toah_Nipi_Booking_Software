import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaBars,
  FaHome,
  FaCalendarAlt,
  FaClipboardList,
  FaPlus,
  FaTable,
  FaRegCalendarCheck,
  FaExclamationTriangle,
  FaClock,
  FaBed,
  FaEnvelopeOpenText,
  FaKey,
  FaTimes,
  FaSignInAlt,
  FaUsers,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCog,
  FaChartBar,
  FaUserShield,
  FaConciergeBell,
  FaShieldAlt,
} from "react-icons/fa";

import { supabase } from "../lib/supabaseClient";
import {
  createGuestPortalLink,
  fetchBookingById,
  fetchBookings,
  saveBooking,
  saveBookings,
  deleteAllBookings,
  deleteBooking,
  getBookingSaveErrorMessage,
} from "../services/bookingService";
import { decideGuestInquiryConversion } from "../services/guestInquiryConversion";
import { markGuestInquiryConverted } from "../services/guestInquiryService";
import {
  getUnlistedStaffNames,
  loadStaffDirectory,
  saveStaffDirectoryChanges,
} from "../services/staffDirectory";

import { sidebarSections } from "../constants/dashboardConstants";
import {
  getBookingDisplayState,
  getConvertedInquiryIds,
  isInquirySpreadsheetRecord,
  isHostRecord,
  convertRecordKind,
} from "../utils/bookingClassification";
import {
  DASHBOARD_PERIOD_STORAGE_KEY,
  formatDashboardPeriodRange,
  formatDashboardPeriodTitle,
  getDashboardPeriodEnd,
  parseDashboardPeriod,
} from "../utils/dashboardPeriod";
import {
  getDashboardHomeDay,
  isDashboardHomeInactiveBooking,
  dashboardHomeBookingTouchesDate,
  getDashboardHomeGuestCount,
  getDashboardHomeBookingDate,
  isDashboardHomePlainInquiry,
  dashboardHomeBookingNeedsHousing,
  dashboardHomeHasValue,
  isDashboardHomeSameDay,
  getDashboardHomeHousingLabel,
} from "../utils/dashboardHome";
import {
  formatSubmittedDate,
  formatDateRange,
  getDaysInMonth,
  getBookingInquiryDateValue,
  addDays,
} from "../utils/dateUtils";
import { getInquiryPipelineColumnKey } from "../utils/inquiryPipeline";
import { getAssignedStaffNamesFromBookings } from "../utils/jobsUtils";
import { loadExcelJS } from "../utils/loadLibraries";
import {
  getBookingImportRowsFromWorksheet,
  getMasterImportIdentity,
  hasMasterImportHeader,
  normalizeMaster2026SpreadsheetRow,
  normalizeMaster2027SpreadsheetRow,
  normalizeMasterSpreadsheetRow,
  prepareMasterImportUpdates,
} from "../utils/masterImport";
import { getSecondaryContact } from "../utils/secondaryContact";
import { cleanExcelCellValue } from "../utils/spreadsheetUtils";
import {
  getSavedStaffUsers,
  getSavedCurrentStaffUserId,
  saveStaffUsers,
  normalizeStaffName,
  createStaffUserId,
  normalizeStaffContactSpreadsheetRow,
  normalizeStaffEmail,
} from "../utils/staffUsers";
import {
  detectMasterSpreadsheetType,
  formatMasterImportKeptValues,
  MASTER_REIMPORT_RULES_TEXT,
  formatImportSaveFailures,
  detectGuestGroupInquirySpreadsheetType,
  normalizeEverythingSpreadsheetRow,
  createWorkbookBulkImportId,
  prepareGuestGroupInquiryImportIds,
} from "../utils/workbookImport";
import { getInquiryDemo, INQUIRY_DEMO_ID, subscribeInquiryDemo } from "../tutorial/inquiryDemo";

import BookingDetailView from "../components/bookingDetail/BookingDetailView";
import DashboardBackups from "../components/DashboardBackups";
import { DashboardHomeDate, DashboardHomeScheduleRow } from "../components/DashboardHomeSchedule";
import DashboardPeriodDialog from "../components/DashboardPeriodDialog";
import DashboardTopbar from "../components/DashboardTopbar";
import StaffSignOutButton from "../components/StaffSignOutButton";
import ThemeToggle from "../components/ThemeToggle";

import CalendarView from "./CalendarView";
import ContactsView from "./ContactsView";
import CreateBooking from "./CreateBooking";
import GuestInquiriesView from "./GuestInquiriesView";
import HostingDetailView from "./HostingDetailView";
import HostingView from "./HostingView";
import InquiryPipelineView from "./InquiryPipeline";
import InquiryRecordDetailView from "./InquiryRecordDetailView";
import InquirySpreadsheetView from "./InquirySpreadsheetView";
import JobsView from "./JobsView";
import LodgingCalendarView from "./LodgingCalendarView";
import PortalAdminView from "./PortalAdminView";
import SeasonReportsView from "./SeasonReportsView";
import SpreadsheetView, { SpreadsheetViewLoadingScreen } from "./SpreadsheetView";
import UserAdminView from "./UserAdminView";

const SPREADSHEET_VIEW_NAME = "Spreadsheet View";
const INQUIRY_SPREADSHEET_VIEW_NAME = "Inquiry Spreadsheet";

const ROUTES = {
  Dashboard: "/dashboard",
  Form: "/form",
  "Portal View": "/portal-admin",

  "Calendar View": "/calendar",
  "Lodging Calendar": "/lodging-calendar",
  "Inquiry Pipeline": "/inquiry-pipeline",
  [SPREADSHEET_VIEW_NAME]: "/master-spreadsheet",
  [INQUIRY_SPREADSHEET_VIEW_NAME]: "/inquiry-spreadsheet",
  "Contacts View": "/contacts",

  Reports: "/reports",
  Backup: "/backup",

  "User Admin": "/user-admin",
  Jobs: "/jobs",

  "Guest Inquiries": "/guest-inquiries",
  Hosting: "/hosting",
};
const VIEW_BY_PATH = Object.fromEntries(
  Object.entries(ROUTES).map(([view, path]) => [path, view])
);

const SPREADSHEET_REVEAL_LOADING_MS = 160;

function getSavedDashboardFilterValue(key, fallbackValue = "") {
  try {
    return localStorage.getItem(key) || fallbackValue;
  } catch (error) {
    console.error("Could not read dashboard filter:", error);
    return fallbackValue;
  }
}

function saveDashboardFilterValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error("Could not save dashboard filter:", error);
  }
}

const DASHBOARD_ACTION_CENTER_STORAGE_KEY = "toahNipiDashboardActionCenter";
const DASHBOARD_QUICK_ACTIONS_STORAGE_KEY = "toahNipiDashboardQuickActions";




function getCalendarCells(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function normalizeInquiry(inquiry, index) {
  const organizationName =
    inquiry.organizationName ||
    inquiry.churchOrMinistry ||
    "Unnamed Organization";

  const contactName =
    inquiry.contactName ||
    inquiry.name ||
    `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
    "";

  return {
    id: inquiry.id || `${inquiry.submittedAt || "inquiry"}-${index}`,
    detectedImportType: inquiry.detectedImportType || "",
    sourceType: inquiry.sourceType || "Form",
    sourceSheet: inquiry.sourceSheet || "",
    sourceRowNumber: inquiry.sourceRowNumber || "",
    rawSpreadsheetData: inquiry.rawSpreadsheetData || null,
    rentalFormDetails: inquiry.rentalFormDetails || null,

    organizationName,
    contactName,
    /* Keep empty values empty; placeholders are added only when rendering. */
    email: inquiry.email || "",
    phone: inquiry.phone || "",
    ...getSecondaryContact(inquiry),

    startDate: inquiry.startDate || "",
    endDate: inquiry.endDate || "",
    desiredDatesText: inquiry.desiredDatesText || inquiry.desiredDates || "",

    attendeeCount: inquiry.attendeeCount || inquiry.groupSize || "",
    retreatType: inquiry.retreatType || "",
    promoCode: inquiry.promoCode || "",
    notes: inquiry.notes || inquiry.message || "",
    waitlist: inquiry.waitlist || "No",
    status: inquiry.status || "Inquiry",
    submittedAt: inquiry.submittedAt || "",

    /*
      Row metadata from the database. updatedAt is the conflict check for
      the next save (AUDIT-045); createdAt and portalToken are read-only.
    */
    updatedAt: inquiry.updatedAt || "",
    createdAt: inquiry.createdAt || "",
    portalToken: inquiry.portalToken || "",
    firstName: inquiry.firstName || "",
    lastName: inquiry.lastName || "",

    inquiryAddress: inquiry.inquiryAddress || "",
    inquiryDisposition: inquiry.inquiryDisposition || inquiry.stageOfGroup || "",

    roomName:
      inquiry.roomName ||
      inquiry.room ||
      inquiry.assignedRoom ||
      inquiry.housingArea ||
      inquiry.buildingsRooms ||
      "Unassigned",

    returningStatus: inquiry.returningStatus || "",
    buildingsRooms: inquiry.buildingsRooms || "",
    meals: inquiry.meals || "",
    foodAllergies: inquiry.foodAllergies || "",
    needToKnow: inquiry.needToKnow || "",
    linenSets: inquiry.linenSets || "",
    linenPieces: inquiry.linenPieces || "",
    activities: inquiry.activities || "",
    facilities: Array.isArray(inquiry.facilities)
      ? inquiry.facilities
      : [],

    programLogisticsAssignments: Array.isArray(inquiry.programLogisticsAssignments)
      ? inquiry.programLogisticsAssignments
      : [],

    checklists: Array.isArray(inquiry.checklists) ? inquiry.checklists : null,

    persons: inquiry.persons || "",
    nights: inquiry.nights || "",
    mealCount: inquiry.mealCount || "",
    camperDays: inquiry.camperDays || "",
    usageFee: inquiry.usageFee || "",
    lodgingCost: inquiry.lodgingCost || "",
    foodCost: inquiry.foodCost || "",
    miscCost: inquiry.miscCost || "",

    stageOfGroup: inquiry.stageOfGroup || "",
    schedule: inquiry.schedule || "",
    minPayingGuests: inquiry.minPayingGuests || "",
    maxPayingGuests: inquiry.maxPayingGuests || "",
    guestRate: inquiry.guestRate || "",
    expectedMinimumRevenue: inquiry.expectedMinimumRevenue || "",
    invoiceLodgingMeals: inquiry.invoiceLodgingMeals || "",
    deposit: inquiry.deposit || "",
    depositReceived: inquiry.depositReceived || "",
    dateOfCancellation: inquiry.dateOfCancellation || "",
    reasonForCancellation: inquiry.reasonForCancellation || "",
    vacancyFilled: inquiry.vacancyFilled || "",
    monthlyProjectedIncome: inquiry.monthlyProjectedIncome || "",

    archiveAddress: inquiry.archiveAddress || "",
    archiveCity: inquiry.archiveCity || "",
    archiveState: inquiry.archiveState || "",
    archiveZip: inquiry.archiveZip || "",
    archiveGuestGroup: inquiry.archiveGuestGroup || "",
    archiveVisitDate: inquiry.archiveVisitDate || "",
    archiveAllPriorVisitDates: inquiry.archiveAllPriorVisitDates || "",
    archiveVisitCount: inquiry.archiveVisitCount || "",
    archiveSourcePdfLink: inquiry.archiveSourcePdfLink || "",
    archivePriorVisitLinks: Array.isArray(inquiry.archivePriorVisitLinks)
      ? inquiry.archivePriorVisitLinks
      : [],
    archiveConfidence: inquiry.archiveConfidence || null,
  };
}



// Phones and tablets get the navigation as a drawer; keep in step with the 940px rules in Dashboard.css.
const COMPACT_NAV_QUERY = "(max-width: 940px)";

function useIsCompactNav() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(COMPACT_NAV_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COMPACT_NAV_QUERY).matches
  );
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const today = new Date();

  const masterFileInputRef = useRef(null);
  const staffContactsFileInputRef = useRef(null);

  const master2026FileInputRef = useRef(null);
  const master2027FileInputRef = useRef(null);
  const importEverythingFileInputRef = useRef(null);
  const importDropdownRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [activeView, setActiveView] = useState(() => VIEW_BY_PATH[location.pathname] || "Dashboard");



  // The address decides the view: on load, and whenever it changes (links, Back, navigate()).
  const [viewPath, setViewPath] = useState(location.pathname);
  if (viewPath !== location.pathname) {
    setViewPath(location.pathname);
    setActiveView(VIEW_BY_PATH[location.pathname] || "Dashboard");
  }
  const [hasOpenedSpreadsheetView, setHasOpenedSpreadsheetView] = useState(false);
  // Every way in counts (Back from a booking, a direct link), not just the sidebar: without this the page is blank.
  if (activeView === SPREADSHEET_VIEW_NAME && !hasOpenedSpreadsheetView) setHasOpenedSpreadsheetView(true);
  const [isSpreadsheetRevealLoading, setIsSpreadsheetRevealLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isCompactNav = useIsCompactNav();
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const isNavDrawerShown = isCompactNav && isNavDrawerOpen;
  // The drawer always shows labels; the icon rail is a desktop choice.
  const isRailCollapsed = isSidebarCollapsed && !isCompactNav;
  const navMenuButtonRef = useRef(null);
  const navDrawerCloseRef = useRef(null);

  useEffect(() => {
    if (!isNavDrawerShown) return undefined;

    navDrawerCloseRef.current?.focus();
    const menuButton = navMenuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsNavDrawerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      menuButton?.focus({ preventScroll: true });
    };
  }, [isNavDrawerShown]);

  const spreadsheetRevealTimerRef = useRef(null);
  const spreadsheetRevealFrameRef = useRef(0);
  const spreadsheetRevealSecondFrameRef = useRef(0);

    const [staffUsers, setStaffUsersState] = useState(() => getSavedStaffUsers());

  const [currentStaffUserId, setCurrentStaffUserId] = useState(() =>
    getSavedCurrentStaffUserId(getSavedStaffUsers())
  );

  /*
    Shared staff directory (AUDIT-017). Until the staff_directory table
    exists, this browser's list keeps working and User Admin says so.
  */
  const [staffDirectoryStatus, setStaffDirectoryStatus] = useState({
    checked: false,
    shared: false,
    reason: "",
  });

  useEffect(() => {
    let cancelled = false;

    loadStaffDirectory(supabase).then((result) => {
      if (cancelled) {
        return;
      }

      setStaffDirectoryStatus({
        checked: true,
        shared: result.available,
        reason: result.reason,
      });

      if (result.available) {
        setStaffUsersState(result.users);
        setCurrentStaffUserId((currentId) =>
          result.users.some((user) => user.id === currentId) ? currentId : ""
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setStaffUsers = async (nextUsers) => {
    const previousUsers = staffUsers;
    setStaffUsersState(nextUsers);

    if (!staffDirectoryStatus.shared) {
      saveStaffUsers(nextUsers);
      return;
    }

    try {
      await saveStaffDirectoryChanges(supabase, previousUsers, nextUsers);
    } catch (error) {
      console.error("Could not save the shared staff directory:", error);
      alert(
        "The staff directory change was not saved. The list has been reloaded from the database."
      );
      const reloaded = await loadStaffDirectory(supabase);
      if (reloaded.available) {
        setStaffUsersState(reloaded.users);
      }
    }
  };

  const copyBrowserStaffListToSharedDirectory = async () => {
    const browserUsers = getSavedStaffUsers();
    const knownNames = new Set(
      staffUsers.map((user) => normalizeStaffName(user.name))
    );
    const usersToAdd = browserUsers
      .filter((user) => !knownNames.has(normalizeStaffName(user.name)))
      .map((user) => ({ ...user, id: createStaffUserId() }));

    if (usersToAdd.length === 0) {
      alert("Everyone in this browser's list is already in the shared directory.");
      return;
    }

    if (
      !window.confirm(
        `Add ${usersToAdd.length} people from this browser's list to the shared staff directory?\n\n` +
          usersToAdd.map((user) => user.name).join(", ")
      )
    ) {
      return;
    }

    await setStaffUsers([...staffUsers, ...usersToAdd]);
  };

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetailTab, setBookingDetailTab] = useState("Overview");
  const [bookingReturnView, setBookingReturnView] = useState(SPREADSHEET_VIEW_NAME);
  const [bookingFormSeed, setBookingFormSeed] = useState(null);

  /*
    A calendar stays mounted (hidden) behind the booking it opened, so its
    view, week, filters and availability summary are still there on Back.
    A hidden element loses its scroll offsets, so those are put back here.
  */
  const isRecordDetailOpen =
    activeView === "Booking Detail" ||
    activeView === "Inquiry Record Detail" ||
    activeView === "Hosting Detail";
  const keptCalendarView = isRecordDetailOpen ? bookingReturnView : activeView;
  const calendarReturnPointRef = useRef(null);

  useLayoutEffect(() => {
    const returnPoint = calendarReturnPointRef.current;

    if (!returnPoint) return;

    if (isRecordDetailOpen) {
      window.scrollTo(0, 0);
      return;
    }

    calendarReturnPointRef.current = null;

    if (activeView !== returnPoint.view) return;

    window.scrollTo(0, returnPoint.scrollY);
    returnPoint.scrollers.forEach(([element, scrollLeft]) => {
      element.scrollLeft = scrollLeft;
    });
    returnPoint.focusTarget?.focus({ preventScroll: true });
  }, [activeView, isRecordDetailOpen]);

  const [
    guestBookingSource,
    setGuestBookingSource,
  ] = useState(null);

  /*
    Shown above the booking form after a save. Lives outside the keyed
    CreateBooking so it survives the form resetting (AUDIT-026), and
    carries a retry when the website inquiry could not be marked (AUDIT-008).
  */
  const [bookingFormNotice, setBookingFormNotice] = useState(null);
  const [isRetryingConversion, setIsRetryingConversion] = useState(false);

  // A tutorial may open the prefilled form from its fictional inquiry; once that demo ends, the form goes back to blank.
  const inquiryDemo = useSyncExternalStore(subscribeInquiryDemo, getInquiryDemo);
  if (!inquiryDemo && bookingFormSeed?.id === INQUIRY_DEMO_ID) {
    setBookingFormSeed(null);
    setGuestBookingSource(null);
  }

    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

  /*
    The signed-in account's database role: admin, staff or viewer
    (staff_profiles). Controls the database would refuse are hidden. ""
    while unknown; then controls stay and the database still decides.
  */
  const [staffRole, setStaffRole] = useState("");
  const isViewOnlyAccount = staffRole === "viewer";
  const canDeleteBookings = staffRole === "" || staffRole === "admin";

  useEffect(() => {
    let cancelled = false;

    supabase.rpc("current_staff_role").then(({ data, error }) => {
      if (!cancelled && !error && typeof data === "string") {
        setStaffRole(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);
  // Dev Mode lives here so it survives view changes; resets on page reload.
  const [isDevMode, setIsDevMode] = useState(false);
  const [publicInquiries, setPublicInquiries] = useState([]);
  const [isBookingsLoading, setIsBookingsLoading] = useState(true);
  const [bookingsLoadError, setBookingsLoadError] = useState(null);
  const [bookingsLoadedAt, setBookingsLoadedAt] = useState(0);

  const [isDashboardActionCenterExpanded, setIsDashboardActionCenterExpanded] =
    useState(() =>
      getSavedDashboardFilterValue(DASHBOARD_ACTION_CENTER_STORAGE_KEY) ===
      "expanded"
    );
  const [isDashboardQuickActionsVisible, setIsDashboardQuickActionsVisible] =
    useState(() =>
      getSavedDashboardFilterValue(DASHBOARD_QUICK_ACTIONS_STORAGE_KEY) !==
      "hidden"
    );
  const [dashboardSummaryPeriod, setDashboardSummaryPeriod] = useState(() =>
    parseDashboardPeriod(
      getSavedDashboardFilterValue(DASHBOARD_PERIOD_STORAGE_KEY),
      getDashboardHomeDay()
    )
  );
  const [isDashboardPeriodDialogOpen, setIsDashboardPeriodDialogOpen] =
    useState(false);

  const toggleDashboardActionCenter = () => {
    const isExpanded = !isDashboardActionCenterExpanded;
    setIsDashboardActionCenterExpanded(isExpanded);
    saveDashboardFilterValue(
      DASHBOARD_ACTION_CENTER_STORAGE_KEY,
      isExpanded ? "expanded" : "collapsed"
    );
  };

  const toggleDashboardQuickActions = () => {
    const isVisible = !isDashboardQuickActionsVisible;
    setIsDashboardQuickActionsVisible(isVisible);
    saveDashboardFilterValue(
      DASHBOARD_QUICK_ACTIONS_STORAGE_KEY,
      isVisible ? "visible" : "hidden"
    );
  };

  const saveDashboardSummaryPeriod = (period) => {
    setDashboardSummaryPeriod(period);
    saveDashboardFilterValue(
      DASHBOARD_PERIOD_STORAGE_KEY,
      JSON.stringify(period)
    );
  };


  function loadBookingsFromSupabase() {
    setIsBookingsLoading(true);
    return fetchBookingsIntoState();
  }

  // The first load runs on mount, while isBookingsLoading already starts true.
  async function fetchBookingsIntoState() {
    try {
      const bookings = await fetchBookings();

      setPublicInquiries(bookings);
      setBookingsLoadError(null);
      setBookingsLoadedAt(Date.now());
    } catch (error) {
      setBookingsLoadError(error);
      console.error("Could not load bookings from Supabase:", error);
      alert("Could not load bookings from Supabase. Check the console.");
    } finally {
      setIsBookingsLoading(false);
    }
  }

  useEffect(() => {
    fetchBookingsIntoState();
  }, []);

  function clearSpreadsheetRevealTimers() {
    if (spreadsheetRevealTimerRef.current) {
      window.clearTimeout(spreadsheetRevealTimerRef.current);
      spreadsheetRevealTimerRef.current = null;
    }

    if (spreadsheetRevealFrameRef.current) {
      window.cancelAnimationFrame(spreadsheetRevealFrameRef.current);
      spreadsheetRevealFrameRef.current = 0;
    }

    if (spreadsheetRevealSecondFrameRef.current) {
      window.cancelAnimationFrame(spreadsheetRevealSecondFrameRef.current);
      spreadsheetRevealSecondFrameRef.current = 0;
    }
  }

  const refreshInquiries = () => {
    loadBookingsFromSupabase();
  };

  const deleteAllInquiries = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all inquiries and imported bookings? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    try {
      const expectedCount = publicInquiries.length;
      const deletedCount = await deleteAllBookings();

      if (deletedCount === 0 && expectedCount > 0) {
        alert(
          "Nothing was deleted. Only administrators can delete bookings."
        );
        return;
      }

      if (deletedCount < expectedCount) {
        alert(
          `Only ${deletedCount} of ${expectedCount} bookings were deleted. Reloading the list.`
        );
        await loadBookingsFromSupabase();
        return;
      }

      setPublicInquiries([]);
      setSelectedBooking(null);
      navigate("/dashboard")
    } catch (error) {
      console.error("Could not delete bookings from Supabase:", error);
      alert("Could not delete bookings from Supabase. Check the console.");
    }
  };

  const closeBookingDetail = () => {
    setSelectedBooking(null);
    // Detail views have no URL of their own: navigate() alone changes nothing when the path already matches.
    setActiveView(bookingReturnView);
    navigate(ROUTES[bookingReturnView]);
  };

  const deleteSingleBooking = async (booking) => {
    if (!booking?.id) {
      return;
    }

    const bookingName =
      booking.organizationName || "this booking";

    const confirmed = window.confirm(
      `Delete "${bookingName}"?\n\nThis will permanently remove this booking. This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteBooking(booking.id);

      setPublicInquiries((currentInquiries) =>
        currentInquiries.filter(
          (inquiry) => inquiry.id !== booking.id
        )
      );

      setBookingDetailTab("Overview");
      closeBookingDetail();
    } catch (error) {
      console.error("Could not delete booking:", error);

      alert(
        error?.code === "BOOKING_NOT_PERMITTED"
          ? error.message
          : "Could not delete this booking. Check the console for more information."
      );
    }
  };


  /*
    Every booking edit goes through here. The booking's updatedAt is the
    value read from the database; the save is refused if anyone saved the
    booking since (AUDIT-045). Screens keep their unsaved edits when a save
    fails, so nothing typed is lost.
  */
    const saveBookingEdits = async (updatedBooking, { allowClassificationChange = false } = {}) => {
    /*
      Booking <-> hosting only through Convert, so an ordinary edit (a
      renamed group, a changed retreat type) never moves a record between
      guest screens and Hosting by accident.
    */
    const previousRecord = publicInquiries.find((inquiry) => inquiry.id === updatedBooking?.id);
    if (
      previousRecord &&
      !allowClassificationChange &&
      isHostRecord(previousRecord) !== isHostRecord(updatedBooking)
    ) {
      const error = new Error(
        isHostRecord(previousRecord)
          ? 'This change would turn the hosting entry into a guest booking. Nothing was saved. Use "Convert to booking" instead.'
          : 'This change would turn the booking into hosting (a name starting "Host:" or retreat type "Hosting"). Nothing was saved. Use "Convert to Hosting" instead.'
      );
      error.code = "BOOKING_CLASSIFICATION_CHANGE";
      alert(error.message);
      throw error;
    }

    if (isViewOnlyAccount) {
      const error = new Error(
        "This account is view-only, so changes cannot be saved. Ask an administrator for staff access."
      );
      error.code = "BOOKING_NOT_PERMITTED";
      alert(error.message);
      throw error;
    }

    try {
      const savedBooking = await saveBooking(updatedBooking);

      setPublicInquiries((currentInquiries) => {
        const existingIndex = currentInquiries.findIndex(
          (inquiry) => inquiry.id === savedBooking.id
        );

        if (existingIndex === -1) {
          return [...currentInquiries, savedBooking];
        }

        return currentInquiries.map((inquiry) =>
          inquiry.id === savedBooking.id ? savedBooking : inquiry
        );
      });

      setSelectedBooking(
        savedBooking
      );

      return savedBooking;
    } catch (error) {
      console.error("Could not save booking to Supabase:", error);
      alert(getBookingSaveErrorMessage(error));
      throw error;
    }
  };

  const importSpreadsheet = async ({
    event,
    importTypeLabel,
    normalizeRow,
    expectedColumns,
  }) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const requestedMasterType =
      normalizeRow === normalizeMasterSpreadsheetRow ? "Master 2025" :
      normalizeRow === normalizeMaster2026SpreadsheetRow ? "Master 2026" :
      normalizeRow === normalizeMaster2027SpreadsheetRow ? "Master 2027" : "";

    try {
      const fileData = await file.arrayBuffer();
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const skippedSheets = [];

      workbook.worksheets.forEach((worksheet) => {
        const spreadsheetRows = getBookingImportRowsFromWorksheet(worksheet);
        const sampleRow = spreadsheetRows[0] || {};
        const hasExpectedColumns = hasMasterImportHeader(sampleRow, expectedColumns);
        const detectedMasterType = detectMasterSpreadsheetType(
          worksheet.name,
          spreadsheetRows
        );

        if (!hasExpectedColumns ||
            (requestedMasterType && detectedMasterType !== requestedMasterType)) {
          skippedSheets.push(worksheet.name);
          return;
        }

        allImportedRows.push(
          ...spreadsheetRows
            .map((row, index) => normalizeRow(row, index))
            .filter(Boolean)
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          `No valid ${importTypeLabel} rows were found. Check the worksheet name and column headings.`
        );
        return;
      }

      const existingBookings = await fetchBookings();
      const existingBookingIds = new Set(
        existingBookings.map((booking) => booking.id)
      );

      let rowsToSave = allImportedRows;
      let masterImportSummary = "";
      let newRecordCount = allImportedRows.filter(
        (booking) => !existingBookingIds.has(booking.id)
      ).length;

      if (requestedMasterType) {
        // Match against the latest database records immediately before importing.
        const prepared = prepareMasterImportUpdates(
          allImportedRows,
          existingBookings
        );

        rowsToSave = prepared.rows;
        newRecordCount = prepared.rows.filter(
          (booking) => !existingBookingIds.has(booking.id)
        ).length;

        const reviewCount = prepared.rows.filter(
          (booking) => booking.rentalFormDetails?.importWarnings?.length
        ).length;

        masterImportSummary =
          `\nNew bookings: ${prepared.added}` +
          `\nExisting bookings updated: ${prepared.updated}` +
          `\nExisting bookings unchanged: ${prepared.unchanged}` +
          formatMasterImportKeptValues(prepared.keptAppValues) +
          `\nDuplicate spreadsheet rows skipped: ${prepared.duplicateRowsSkipped}` +
          (prepared.duplicateExistingRecords
            ? `\nOther existing duplicate records retained: ${prepared.duplicateExistingRecords}`
            : "") +
          `\nBookings with import review notes: ${reviewCount}`;

        const confirmed = window.confirm(
          `Import ${requestedMasterType}?\n${masterImportSummary}\n\n` +
          (newRecordCount === 0
            ? `NO NEW BOOKINGS DETECTED\nAll matching bookings are already in the database.\n\n`
            : `New bookings that will be added: ${newRecordCount}\n\n`) +
          MASTER_REIMPORT_RULES_TEXT +
          `\nReview notes will appear in each booking's Notes section.`
        );

        if (!confirmed) return;
      }

      const { saved: savedRows, failures } = await saveBookings(rowsToSave);
      setPublicInquiries((currentInquiries) => {
        const byId = new Map(currentInquiries.map((booking) => [booking.id, booking]));
        savedRows.forEach((booking) => byId.set(booking.id, booking));
        return Array.from(byId.values());
      });

      const skippedMessage = skippedSheets.length
        ? `\n\nSkipped sheets: ${skippedSheets.join(", ")}`
        : "";

      const noNewRecordsMessage = newRecordCount === 0
        ? `\n\nNo new records were added. Everything in this import already matched records in the database.`
        : `\n\nNew records added: ${newRecordCount}`;

      alert(
        `Imported ${savedRows.length} ${importTypeLabel} row(s).` +
        `${noNewRecordsMessage}${masterImportSummary}${skippedMessage}` +
        formatImportSaveFailures(failures)
      );
    } catch (error) {
      console.error(`Could not import ${importTypeLabel} spreadsheet:`, error);
      alert(
        `Sorry, that ${importTypeLabel} spreadsheet could not be imported.\n\n` +
        `Error: ${error?.message || String(error)}`
      );
    } finally {
      input.value = "";
    }
  };


  const handleImportMasterSpreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2025 booking",
      normalizeRow: normalizeMasterSpreadsheetRow,
      expectedColumns: [
        "Arrival Date",
        "Departure Date",

        "Guest Group Name",
        "Guest Group Type",
        "Returning (R) or New (N)",

        "Contact Person",
        "Contact Person Cell #",

        "Actual # of Adults",
        "Actual # of Minors 3 to 17",
        "Actual # of Minors under 3",
        "Actual # of Day Use Guests",
        "Total # of Guests",

        // Older aliases kept for compatibility.
        "Actual Number of Guests",
        "Actual # of Guests",

        "Buildings/Rooms",

        "Meals",
        "Food Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",

        "#Persons",
        "#Nights",
        "#Meals",
        "Camper Days (nightsX0.4 + mealsX0.2)",

        "Usage Fee",
        "$ Lodging",
        "$ Food",
        "$ Misc.",
        "$ Misc",
      ],
    });
  };

  const handleImportMaster2026Spreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2026 booking",
      normalizeRow: normalizeMaster2026SpreadsheetRow,
      expectedColumns: [
        "name",
        "Name",
        "Guest Group Type",
        "Returning (R) or New (N)",
        "Group Leader/Contact Person",
        "Phone",
        "Estimated Number of Guests",
        "Buildings/Rooms",
        "Meals",
        "Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",
        "Contact Person Email",
        "Stage of Group",
        "Min. Number of Paying Guests",
        "Max. Number of Paying Guests",
        "Guest Rate",
        "Exp. Minimum Revenue for Lodging/Meals",
        "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",
        "Notes",
        "Deposit",
        "Deposit Received",
        "Date of Cancellation",
        "Reason for Cancellation",
        "Vacancy filled by another group?",
        "#Persons",
        "#Nights",
        "#Meals",
        "Camper Days (nightsX0.4 + mealsX0.2)",
        "Usage Fee",
        "$ Lodging",
        "$ Food",
        "$ Misc",
        "Monthly Sum of Projected Income",
      ],
    });
  };


  const handleImportMaster2027Spreadsheet = (event) => {
    importSpreadsheet({
      event,
      importTypeLabel: "master 2027 booking",
      normalizeRow: normalizeMaster2027SpreadsheetRow,

      expectedColumns: [
        "Arrival Date",
        "Departure Date",
        "Confirmed or Unconfirmed",
        "Guest Group Name",
        "Guest Group Type",
        "Returning (R) or New (N)",
        "Contact Person",
        "Contact Person Cell #",
        "Contact Person Email",
        "Estimated # of Guests",
        "Buildings/Rooms",
        "# of Nights",
        "Meals",
        "Stage of Group",
        "$250 Deposit for 2027 Rec'd?",
        "Food Allergies",
        "Need to know",
        "Linen Sets",
        "Activities",
        "Min. Number of Paying Guests",
        "Max. Number of Paying Guests",
        "Guest Rate",
        "Exp. Minimum Revenue",
        "Schedule",
        "Date of Cancellation",
        "Reason for Cancellation",
        "Vacancy filled by another group?",
        "#Persons",
        "#Nights",
        "#Meals",
        "Camper Days (nightsX0.4 + mealsX0.2)",
        "Usage Fee",
        "$ Lodging",
        "$ Food",
        "$ Misc",
      ],
    });
  };

  const handleImportEverythingSpreadsheet = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileName = String(file.name || "").toLowerCase();

    if (!fileName.endsWith(".xlsx")) {
      alert("Please upload a .xlsx workbook.");

      event.target.value = "";
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const allImportedRows = [];
      const sheetSummaries = [];

      const importCounts = {
        "Master 2025": 0,
        "Master 2026": 0,
        "Master 2027": 0,

        "Guest Group Inquiry 2025": 0,
        "Guest Group Inquiry 2026": 0,
        "Guest Group Inquiry 2027": 0,
      };

      workbook.worksheets.forEach((worksheet) => {
        const spreadsheetRows =
          getBookingImportRowsFromWorksheet(worksheet);

        /*
          First see whether this is one of the Master sheets.
        */
        const detectedMasterType =
          detectMasterSpreadsheetType(
            worksheet.name,
            spreadsheetRows
          );

        /*
          If it is not Master data, see whether it is one of
          the Guest Group Inquiry / No's sheets.
        */
        const detectedInquiryType =
          detectGuestGroupInquirySpreadsheetType(
            worksheet.name
          );

        const detectedType =
          detectedMasterType ||
          detectedInquiryType;

        /*
          Stuff such as:
          - Staff_Contacts
          - Counts by Group Type
          - Risk Management

          stays untouched.
        */
        if (!detectedType) {
          sheetSummaries.push(
            `${worksheet.name}: skipped — not a recognized Master or Guest Group Inquiry sheet`
          );

          return;
        }

        let importedCount = 0;
        let skippedRowCount = 0;

        spreadsheetRows.forEach((row, index) => {
          const normalizedRow =
            normalizeEverythingSpreadsheetRow(
              row,
              index,
              detectedType
            );

          if (!normalizedRow) {
            skippedRowCount += 1;
            return;
          }

          const sourceRowNumber =
            normalizedRow.sourceRowNumber ||
            row.sourceRowNumber ||
            index + 1;

          const sourceSheet =
            normalizedRow.sourceSheet ||
            row.sourceSheet ||
            worksheet.name;

          allImportedRows.push({
            ...normalizedRow,

            /*
              Stable/repeatable ID so importing the same workbook
              again updates the same records instead of duplicating
              everything.
            */
            id: detectedType.startsWith("Master ")
              ? normalizedRow.id
              : createWorkbookBulkImportId({
                  detectedType,
                  sourceSheet,
                  sourceRowNumber,
                }),

            sourceType: detectedType,
            detectedImportType: detectedType,

            sourceSheet,
            sourceRowNumber,
          });

          importedCount += 1;
          importCounts[detectedType] += 1;
        });

        sheetSummaries.push(
          `${worksheet.name}: ${importedCount} ${detectedType} source row(s) read, ${skippedRowCount} empty/invalid row(s) skipped`
        );
      });

      if (allImportedRows.length === 0) {
        alert(
          "No recognized Master or Guest Group Inquiry booking rows were found in this workbook."
        );

        return;
      }

      const existingBookings = await fetchBookings();
      const existingBookingIds = new Set(
        existingBookings.map((booking) => booking.id)
      );

      const hasMasterRows = allImportedRows.some((booking) =>
        getMasterImportIdentity(booking)
      );

      const importRows = prepareGuestGroupInquiryImportIds(
        allImportedRows,
        existingBookings
      );

      const prepared = hasMasterRows
        ? prepareMasterImportUpdates(importRows, existingBookings)
        : {
            rows: importRows,
            added: 0,
            updated: 0,
            unchanged: 0,
            keptAppValues: [],
            duplicateRowsSkipped: 0,
            duplicateExistingRecords: 0,
          };

      const newRecordCount = prepared.rows.filter(
        (booking) => !existingBookingIds.has(booking.id)
      ).length;

      // Report the rows that will be saved, after duplicate Master rows are skipped.
      Object.keys(importCounts).forEach((type) => {
        importCounts[type] = prepared.rows.filter((booking) => booking.sourceType === type).length;
      });
      const reviewCount = prepared.rows.filter(
        (booking) => booking.rentalFormDetails?.importWarnings?.length
      ).length;
      const masterImportSummary = hasMasterRows
        ? `Master bookings added: ${prepared.added}\n` +
          `Master bookings updated: ${prepared.updated}\n` +
          `Master bookings unchanged: ${prepared.unchanged}\n` +
          (formatMasterImportKeptValues(prepared.keptAppValues).trim()
            ? `${formatMasterImportKeptValues(prepared.keptAppValues).trim()}\n`
            : "") +
          `Duplicate spreadsheet rows skipped: ${prepared.duplicateRowsSkipped}\n` +
          (prepared.duplicateExistingRecords
            ? `Other existing duplicate records retained: ${prepared.duplicateExistingRecords}\n`
            : "") +
          `Bookings with import review notes: ${reviewCount}\n\n`
        : "";

      const confirmed = window.confirm(
        `Import booking workbook?\n\n` +

          `MASTER SHEETS\n` +
          `2025 Master: ${importCounts["Master 2025"]} row(s)\n` +
          `2026 Master: ${importCounts["Master 2026"]} row(s)\n` +
          `2027 Master: ${importCounts["Master 2027"]} row(s)\n\n` +

          `GUEST GROUP INQUIRIES / NO'S\n` +
          `2025: ${importCounts["Guest Group Inquiry 2025"]} row(s)\n` +
          `2026: ${importCounts["Guest Group Inquiry 2026"]} row(s)\n` +
          `2027: ${importCounts["Guest Group Inquiry 2027"]} row(s)\n\n` +

          `TOTAL\n` +
          `${prepared.rows.length} row(s)\n\n` +

          masterImportSummary +
          (newRecordCount === 0
            ? `NO NEW RECORDS DETECTED\nEverything in this workbook already matches records in the database.\n\n`
            : `New records that will be added: ${newRecordCount}\n\n`) +
          MASTER_REIMPORT_RULES_TEXT +
          `\nOther worksheet types will be skipped.`
      );

      if (!confirmed) {
        return;
      }

      const { saved: savedRows, failures } =
        await saveBookings(prepared.rows);

      setPublicInquiries((currentInquiries) => {
        const byId = new Map();

        currentInquiries.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        savedRows.forEach((booking) => {
          byId.set(booking.id, booking);
        });

        return Array.from(byId.values());
      });

      alert(
        `Workbook import complete.\n\n` +

          `MASTER SHEETS\n` +
          `2025: ${importCounts["Master 2025"]}\n` +
          `2026: ${importCounts["Master 2026"]}\n` +
          `2027: ${importCounts["Master 2027"]}\n\n` +

          `GUEST GROUP INQUIRIES / NO'S\n` +
          `2025: ${importCounts["Guest Group Inquiry 2025"]}\n` +
          `2026: ${importCounts["Guest Group Inquiry 2026"]}\n` +
          `2027: ${importCounts["Guest Group Inquiry 2027"]}\n\n` +

          `Total imported: ${savedRows.length}\n` +
          `New records added: ${newRecordCount}\n\n` +
          (newRecordCount === 0
            ? `No new records were added. Everything in this workbook already matched records in the database.\n\n`
            : "") +
          masterImportSummary +
          `${sheetSummaries.join("\n")}` +
          formatImportSaveFailures(failures)
      );
    } catch (error) {
      console.error("Could not import booking workbook:", error);

      alert(
        `Sorry, that booking workbook could not be imported.\n\n` +
          `Error: ${error?.message || String(error)}`
      );
    } finally {
      event.target.value = "";
    }
  };


  const handleImportStaffContactsSpreadsheet = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileData = await file.arrayBuffer();

      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileData);

      const staffWorksheet = workbook.worksheets.find(
        (worksheet) =>
          String(worksheet.name || "").trim().toLowerCase() === "staff_contacts"
      );

      if (!staffWorksheet) {
        alert('No "Staff_Contacts" sheet was found in this workbook.');
        return;
      }

      const importedStaffContacts = [];

      staffWorksheet.eachRow((row, rowNumber) => {
        const nameCell = cleanExcelCellValue(row.getCell(2).value);
        const emailCell = cleanExcelCellValue(row.getCell(3).value);

        const normalizedStaffContact = normalizeStaffContactSpreadsheetRow({
          nameCell,
          emailCell,
          index: rowNumber,
        });

        if (normalizedStaffContact) {
          importedStaffContacts.push(normalizedStaffContact);
        }
      });

      if (importedStaffContacts.length === 0) {
        alert(
          'No valid staff contacts were found. Make sure "Staff_Contacts" has names in column B and emails in column C.'
        );
        return;
      }

      const nextUsers = [...staffUsers];
      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      importedStaffContacts.forEach((importedUser) => {
        const importedNameKey = normalizeStaffName(importedUser.name);
        const importedEmailKey = normalizeStaffEmail(importedUser.email);

        if (!importedNameKey && !importedEmailKey) {
          skippedCount += 1;
          return;
        }

        const existingUserIndex = nextUsers.findIndex((user) => {
          const existingEmailKey = normalizeStaffEmail(user.email);
          const existingNameKey = normalizeStaffName(user.name);

          return (
            (importedEmailKey && existingEmailKey === importedEmailKey) ||
            (importedNameKey && existingNameKey === importedNameKey)
          );
        });

        if (existingUserIndex >= 0) {
          const existingUser = nextUsers[existingUserIndex];

          nextUsers[existingUserIndex] = {
            ...existingUser,
                        name: importedUser.name || existingUser.name,
            email: importedUser.email || existingUser.email,
            // Keep a deactivated person deactivated.
            active: existingUser.active !== false,
            updatedAt: new Date().toISOString(),
          };

          updatedCount += 1;
          return;
        }

        nextUsers.push(importedUser);
        addedCount += 1;
      });

            await setStaffUsers(nextUsers);


      alert(
        `Imported staff contacts from Staff_Contacts.\n\nAdded: ${addedCount}\nUpdated: ${updatedCount}\nSkipped: ${skippedCount}`
      );
    } catch (error) {
      console.error("Could not import staff contacts spreadsheet:", error);
      alert(
        "Sorry, that staff contacts spreadsheet could not be imported.\n\n" +
          `Error: ${error?.message || String(error)}`
      );
    } finally {
      event.target.value = "";
    }
  };


  const openMasterImportPicker = () => {
    setIsImportMenuOpen(false);
    masterFileInputRef.current?.click();
  };

  const openMaster2026ImportPicker = () => {
    setIsImportMenuOpen(false);
    master2026FileInputRef.current?.click();
  };

  const openMaster2027ImportPicker = () => {
    setIsImportMenuOpen(false);
    master2027FileInputRef.current?.click();
  };


  const openEverythingImportPicker = () => {
    setIsImportMenuOpen(false);
    importEverythingFileInputRef.current?.click();
  };

  const openStaffContactsImportPicker = () => {
    setIsImportMenuOpen(false);
    staffContactsFileInputRef.current?.click();
  };

  useEffect(() => {
    return () => {
      clearSpreadsheetRevealTimers();
    };
  }, []);

  useEffect(() => {
    const handleClickOutsideImportMenu = (event) => {
      if (!isImportMenuOpen) {
        return;
      }

      if (
        importDropdownRef.current &&
        !importDropdownRef.current.contains(event.target)
      ) {
        setIsImportMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideImportMenu);

    return () => {
      document.removeEventListener("mousedown", handleClickOutsideImportMenu);
    };
  }, [isImportMenuOpen]);


  /*
    Every record, for staff names and lodging occupancy. Guest booking
    screens get inquiryBookings, which never holds hosting; the Hosting
    view gets hostingRecords.
  */
  const allBookingRecords = useMemo(() => {
    return publicInquiries.map((inquiry, index) =>
      normalizeInquiry(inquiry, index)
    );
  }, [publicInquiries]);

  const inquiryBookings = useMemo(
    () => allBookingRecords.filter((record) => !isHostRecord(record)),
    [allBookingRecords]
  );

  const hostingRecords = useMemo(
    () => allBookingRecords.filter(isHostRecord),
    [allBookingRecords]
  );

  const datedHostingRecords = useMemo(
    () => hostingRecords.filter((record) => record.startDate),
    [hostingRecords]
  );

  /*
    Names on bookings that are not in the staff directory. They are shown
    in User Admin to add by hand; nothing is added automatically, so a
    deleted or renamed person does not come back (AUDIT-017).
  */
  const unlistedStaffNames = useMemo(
    () =>
      getUnlistedStaffNames(
        getAssignedStaffNamesFromBookings(allBookingRecords),
        staffUsers
      ),
    [allBookingRecords, staffUsers]
  );

  const inquiryPipelineNeedsReviewCount = useMemo(() => {
    return inquiryBookings.filter((booking) => {
      const columnKey = getInquiryPipelineColumnKey(booking);

      return columnKey === "newInquiry" || columnKey === "needsReview";
    }).length;
  }, [inquiryBookings]);

  const calendarCells = getCalendarCells(selectedYear, selectedMonth);

  const datedInquiries = useMemo(() => {
    return inquiryBookings
      .filter((inquiry) => inquiry.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [inquiryBookings]);

  const selectedMonthInquiries = useMemo(() => {
    const monthStart = new Date(selectedYear, selectedMonth, 1);
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

    return datedInquiries.filter((inquiry) => {
      const startDate = new Date(`${inquiry.startDate}T00:00:00`);
      const endDate = inquiry.endDate
        ? new Date(`${inquiry.endDate}T00:00:00`)
        : startDate;

      return startDate <= monthEnd && endDate >= monthStart;
    });
  }, [datedInquiries, selectedMonth, selectedYear]);



  /* =========================================================
     DASHBOARD HOME — OPERATIONAL SNAPSHOT
  ========================================================= */

  const dashboardToday =
    getDashboardHomeDay(today);

  const dashboardSevenDaysOut =
    addDays(dashboardToday, 7);

  const dashboardPeriodEnd =
    getDashboardPeriodEnd(
      dashboardToday,
      dashboardSummaryPeriod
    );

  const dashboardPeriodTitle =
    formatDashboardPeriodTitle(
      dashboardSummaryPeriod
    );

  const dashboardNinetyDaysOut =
    addDays(dashboardToday, 90);

  const dashboardNinetyDaysAgo =
    addDays(dashboardToday, -90);

  /*
    An inquiry converted into a staff booking stays in the table; the
    staff booking (sourceInquiryId) represents it, as in the Pipeline.
  */
  const dashboardConvertedInquiryIds =
    getConvertedInquiryIds(inquiryBookings);

  const dashboardActiveBookings =
    inquiryBookings.filter(
      (booking) =>
        !isDashboardHomeInactiveBooking(
          booking
        ) &&
        !dashboardConvertedInquiryIds.has(
          String(booking.id || "").trim()
        )
    );

  const dashboardActiveBookingSet =
    new Set(dashboardActiveBookings);

  const dashboardScheduledBookings =
    datedInquiries.filter(
      (booking) =>
        dashboardActiveBookingSet.has(
          booking
        )
    );

  const dashboardBookingsToday =
    dashboardScheduledBookings.filter(
      (booking) =>
        dashboardHomeBookingTouchesDate(
          booking,
          dashboardToday
        )
    );

  const dashboardGuestsToday =
    dashboardBookingsToday.reduce(
      (total, booking) =>
        total +
        getDashboardHomeGuestCount(
          booking
        ),
      0
    );

  const dashboardArrivalsNextSevenDays =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate < dashboardSevenDaysOut
        );
      }
    );

  const dashboardUpcomingPeriod =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardPeriodEnd
        );
      }
    );

  const dashboardUpcomingPeriodGuests =
    dashboardUpcomingPeriod.reduce(
      (total, booking) =>
        total +
        getDashboardHomeGuestCount(
          booking
        ),
      0
    );

  const dashboardMissingDates =
    dashboardActiveBookings.filter(
      (booking) => {
        if (booking.startDate) {
          return false;
        }

        // No genuine inquiry date means the record is not "recent".
        const inquiryDate =
          getDashboardHomeBookingDate(
            getBookingInquiryDateValue(
              booking
            )
          );

        return (
          inquiryDate &&
          inquiryDate >=
            dashboardNinetyDaysAgo
        );
      }
    );

  const dashboardHousingNeedsAttention =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardNinetyDaysOut &&
          !isDashboardHomePlainInquiry(
            booking
          ) &&
          dashboardHomeBookingNeedsHousing(
            booking
          )
        );
      }
    );

  const dashboardGuestCountsMissing =
    dashboardScheduledBookings.filter(
      (booking) => {
        const startDate =
          getDashboardHomeBookingDate(
            booking.startDate
          );

        // "N/A", "TBD", "?" etc. are not a recorded group size.
        const hasGuestCount =
          dashboardHomeHasValue(
            booking.attendeeCount
          ) ||
          dashboardHomeHasValue(
            booking.persons
          );

        return (
          startDate &&
          startDate >= dashboardToday &&
          startDate <= dashboardNinetyDaysOut &&
          !isDashboardHomePlainInquiry(
            booking
          ) &&
          !hasGuestCount
        );
      }
    );

  const dashboardAttentionItems = [
    {
      id: "dates",
      title: "Missing retreat dates",
      description:
        "Recent active inquiries from the last 90 days still need dates.",
      count: dashboardMissingDates.length,
      tone: "gold",
      icon: FaCalendarAlt,
      view: INQUIRY_SPREADSHEET_VIEW_NAME,
    },
    {
      id: "housing",
      title: "Lodging not assigned",
      description:
        "Upcoming groups in the next 90 days still need housing.",
      count:
        dashboardHousingNeedsAttention.length,
      tone: "blue",
      icon: FaBed,
      view: "Lodging Calendar",
    },
    {
      id: "guests",
      title: "Guest counts missing",
      description:
        "Upcoming groups are missing a recorded group size.",
      count:
        dashboardGuestCountsMissing.length,
      tone: "purple",
      icon: FaUsers,
      view: SPREADSHEET_VIEW_NAME,
    },
    // Contract, deposit and insurance progress is tracked in Portal Admin.
  ];

  const dashboardVisibleAttentionItems =
    dashboardAttentionItems.filter(
      (item) => item.count > 0
    );

  const dashboardAttentionTotal =
    dashboardVisibleAttentionItems.reduce(
      (total, item) =>
        total + item.count,
      0
    );

  const dashboardWeekDays = Array.from(
    { length: 7 },
    (_, index) => {
      const date = addDays(
        dashboardToday,
        index
      );

      const arrivals =
        dashboardScheduledBookings.filter(
          (booking) => {
            const startDate =
              getDashboardHomeBookingDate(
                booking.startDate
              );

            return isDashboardHomeSameDay(
              startDate,
              date
            );
          }
        );

      const onSite =
        dashboardScheduledBookings.filter(
          (booking) =>
            dashboardHomeBookingTouchesDate(
              booking,
              date
            )
        );

      return {
        date,
        arrivals,
        staying: onSite.filter(
          (booking) => !arrivals.includes(booking)
        ),
        onSite,
        guests: onSite.reduce(
          (total, booking) =>
            total +
            getDashboardHomeGuestCount(
              booking
            ),
          0
        ),
      };
    }
  );

  const dashboardCurrentStaffUser =
    staffUsers.find(
      (user) =>
        user.id === currentStaffUserId
    );

  const dashboardGreeting =
    today.getHours() < 12
      ? "Good morning"
      : today.getHours() < 17
      ? "Good afternoon"
      : "Good evening";

  const dashboardTodayLabel =
    today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const dashboardQuickActions = [
    {
      label: "New Booking",
      description:
        "Create a staff booking",
      icon: FaPlus,
      view: "Form",
    },
    {
      label: "Main Calendar",
      description:
        "See all scheduled groups",
      icon: FaCalendarAlt,
      view: "Calendar View",
    },
    {
      label: "Lodging Calendar",
      description:
        "Check building availability",
      icon: FaBed,
      view: "Lodging Calendar",
    },
    {
      label: "Guest Inquiries",
      description:
        "Review new guest requests",
      icon: FaEnvelopeOpenText,
      view: "Guest Inquiries",
    },
    {
      label: "Master Spreadsheet",
      description:
        "Open all booking records",
      icon: FaTable,
      view: SPREADSHEET_VIEW_NAME,
    },
    {
      label: "Jobs",
      description:
        "View assigned staff work",
      icon: FaClipboardList,
      view: "Jobs",
    },
  ];


  const exportInquiriesToSpreadsheet = async () => {
    if (inquiryBookings.length === 0) {
      alert("There are no inquiries to export yet.");
      return;
    }

        /*
      A contact list, not a backup (AUDIT-014, Q-034 A). The disposition
      column uses the Guest Group sheets' own heading and values, and the
      date is the real inquiry date. JSON Backup is the full-data format.
    */
    let ExcelJS;
    try {
      ExcelJS = await loadExcelJS();
    } catch (error) {
      alert(error.message);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Contact List");

    worksheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Contact Name", key: "contactName", width: 24 },
      { header: "Email Address", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Secondary Contact Name", key: "secondaryContactName", width: 24 },
      { header: "Secondary Contact Phone", key: "secondaryContactPhone", width: 22 },
      { header: "Secondary Contact Email", key: "secondaryContactEmail", width: 30 },
      { header: "Guest Group Name", key: "guestGroupName", width: 30 },
      { header: "Size", key: "size", width: 10 },
      { header: "Desired Dates", key: "desiredDates", width: 28 },
      { header: "Additional Notes", key: "additionalNotes", width: 44 },
            { header: "Waitlist, Considering or No", key: "disposition", width: 22 },
      { header: "Booking", key: "bookingState", width: 16 },
    ];

    inquiryBookings.forEach((inquiry) => {
      worksheet.addRow({
                date: getBookingInquiryDateValue(inquiry)
          ? formatSubmittedDate(`${getBookingInquiryDateValue(inquiry)}T12:00:00`)
          : "",
        contactName: inquiry.contactName,
        email: inquiry.email === "No email provided" ? "" : inquiry.email,
        phone: inquiry.phone === "No phone provided" ? "" : inquiry.phone,
        ...getSecondaryContact(inquiry),
        guestGroupName: inquiry.organizationName,
        size: inquiry.attendeeCount || "",
        desiredDates:
          inquiry.desiredDatesText ||
          (inquiry.startDate || inquiry.endDate
            ? formatDateRange(inquiry.startDate, inquiry.endDate)
            : ""),
                additionalNotes: inquiry.notes || "",
        disposition: inquiry.inquiryDisposition || inquiry.stageOfGroup || "",
        bookingState: getBookingDisplayState(inquiry).label,
      });
    });

    const aboutSheet = workbook.addWorksheet("About this file");
    aboutSheet.addRow(["Toah Nipi contact list"]);
    aboutSheet.addRow([`Exported ${new Date().toLocaleString()}`]);
    aboutSheet.addRow([
      "This is a contact list for reference. It is not a backup and is not meant to be imported back. Use Backups (JSON) for a full copy of the data.",
    ]);

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.getRow(1).height = 22;

    worksheet.eachRow((row) => {
      row.alignment = {
        vertical: "top",
        wrapText: true,
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
        link.download = "toah-nipi-contact-list.xlsx";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((current) => current - 1);
      return;
    }

    setSelectedMonth((current) => current - 1);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((current) => current + 1);
      return;
    }

    setSelectedMonth((current) => current + 1);
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };

  const getCalendarEventColor = () => {

    return "calendar-event-green";

  };

  const handleActiveViewChange = (nextView) => {
    clearSpreadsheetRevealTimers();

    if (nextView === SPREADSHEET_VIEW_NAME) {
      setHasOpenedSpreadsheetView(true);
      setIsSpreadsheetRevealLoading(true);

      spreadsheetRevealFrameRef.current = window.requestAnimationFrame(() => {
        spreadsheetRevealSecondFrameRef.current = window.requestAnimationFrame(() => {
          spreadsheetRevealTimerRef.current = window.setTimeout(() => {
            setIsSpreadsheetRevealLoading(false);
          }, SPREADSHEET_REVEAL_LOADING_MS);
        });
      });
    } else {
      setIsSpreadsheetRevealLoading(false);
    }

    if (nextView !== "Form") {
      loadBookingsFromSupabase();
      // Leaving the form ends any pending website-inquiry conversion.
      setBookingFormSeed(null);
      setGuestBookingSource(null);
    }

    setActiveView(nextView);
    navigate(ROUTES[nextView] || "/dashboard");
  };

  const openHostingDetail = (record, returnView = "Hosting") => {
    setBookingReturnView(returnView);
    setSelectedBooking(record);
    setActiveView("Hosting Detail");
  };

  // Hosting always opens in its own detail view, wherever it was found.
  const openBookingDetail = (booking, returnView = SPREADSHEET_VIEW_NAME) => {
    if (isHostRecord(booking)) {
      openHostingDetail(booking, returnView);
      return;
    }
    setBookingReturnView(returnView);
    setSelectedBooking(booking);
    setBookingDetailTab("Overview");
    setActiveView("Booking Detail");
  };

  const openInquiryRecordDetail = (
    booking,
    returnView = INQUIRY_SPREADSHEET_VIEW_NAME
  ) => {
    setBookingReturnView(returnView);
    setSelectedBooking(booking);
    setBookingDetailTab("Overview");
    setActiveView("Inquiry Record Detail");
  };

  /*
    Calendars pass only an id. The row is read fresh because a calendar can
    stay open for hours while other staff change or delete bookings.
  */
  const openCalendarBooking = async (bookingId) => {
    const returnView = activeView;
    const focused = document.activeElement;
    const returnPoint = {
      view: returnView,
      scrollY: window.scrollY,
      scrollers: [
        ...document.querySelectorAll(".calendar-view-card, .calendar-week-grid, .season-map-scroll, .season-drawer-list"),
      ].map((element) => [element, element.scrollLeft]),
      // Only for keyboard use: after a mouse click it would pop the tooltip open.
      focusTarget: focused?.matches(":focus-visible") ? focused : null,
    };

    let latestBooking;

    try {
      latestBooking = await fetchBookingById(bookingId);
    } catch (error) {
      console.error("Could not open booking:", error);
      alert("Could not open this booking. Check your connection and try again.");
      return;
    }

    if (!latestBooking) {
      alert("This booking no longer exists. It may have been deleted, so the calendar will refresh.");
      loadBookingsFromSupabase();
      return;
    }

    // Staff moved to another page while the booking was loading.
    if (window.location.pathname !== ROUTES[returnView]) return;

    setPublicInquiries((currentInquiries) =>
      currentInquiries.map((inquiry) =>
        inquiry.id === latestBooking.id ? latestBooking : inquiry
      )
    );

    calendarReturnPointRef.current = returnPoint;

    const booking = normalizeInquiry(latestBooking);
    const openDetail = isHostRecord(booking)
      ? openHostingDetail
      : isInquirySpreadsheetRecord(booking)
        ? openInquiryRecordDetail
        : openBookingDetail;

    openDetail(booking, returnView);
  };

  /*
    Booking <-> Hosting. Staff see the concrete effects first. The save is
    one conditional update (refused if anyone saved the record since), and
    the database drops a hosting record's portal link in the same write.
  */
  const convertRecord = async (record, toHosting) => {
    const next = convertRecordKind(record, toHosting);
    if (next === record) return;

    const changes = ["organizationName", "retreatType"]
      .filter((field) => String(record[field] ?? "") !== String(next[field] ?? ""))
      .map((field) =>
        `  ${field === "organizationName" ? "Name" : "Retreat type"}: "${record[field] || ""}" -> "${next[field] || ""}"`
      );

    const effects = toHosting
      ? [
          `Convert "${record.organizationName}" to Hosting?`,
          "",
          "- It leaves the spreadsheets, calendars, dashboard, reports, Portal Admin and contacts' booking history, and appears under Hosting.",
          "- Its guest portal link stops working immediately. Converting back later does not restore that link.",
          "- No guest emails are sent; queued or automatic guest emails for it are suppressed.",
          "- Lodging stays assigned and still blocks those rooms.",
          "- Notes, files, portal tasks, signatures and email history are kept for staff.",
        ]
      : [
          `Convert "${record.organizationName}" to a guest booking?`,
          "",
          "- It returns to the spreadsheets, calendars, dashboard and reports.",
          "- Nothing is sent: no emails, no signing, no reminders. Portal emails stay off until staff turn them on.",
          "- It has no guest portal link. Create a new one from the booking when the group needs it.",
          "- Lodging, notes, files and history are kept.",
        ];

    if (!window.confirm([...effects, ...(changes.length ? ["", "Fields that change:", ...changes] : [])].join("\n"))) {
      return;
    }

    try {
      const saved = normalizeInquiry(await saveBookingEdits(next, { allowClassificationChange: true }));
      if (toHosting) {
        // Back then lands on the Hosting page, where the record now lives.
        openHostingDetail(saved, "Hosting");
      } else {
        openBookingDetail(saved, SPREADSHEET_VIEW_NAME);
      }
    } catch {
      // saveBookingEdits already explained the failure; nothing changed.
    }
  };

  // Explicit staff action: a booking without a portal link gets a new one.
  const createPortalLinkForBooking = async (record) => {
    if (!window.confirm(`Create a new guest portal link for "${record.organizationName}"? Nothing is emailed; share the link yourself when ready.`)) {
      return;
    }
    try {
      const saved = await createGuestPortalLink(record.id);
      setPublicInquiries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setSelectedBooking(normalizeInquiry(saved));
    } catch (error) {
      console.error("Could not create a portal link:", error);
      alert(error?.message || "Could not create a portal link.");
    }
  };

  // A clash link inside a detail view: open that record; Back keeps the original origin.
  const openRecordFromDetail = (recordId) => {
    const record = allBookingRecords.find((item) => item.id === recordId);
    if (!record) {
      alert("This record is not in the loaded list. Refresh and try again.");
      return;
    }
    openBookingDetail(record, bookingReturnView);
  };

  const startBookingFromInquiry = (booking) => {
    setBookingFormSeed(booking);
    // A staff-sheet inquiry is never a website inquiry (AUDIT-004).
    setGuestBookingSource(null);
    setBookingFormNotice(null);

    setSelectedBooking(null);
    setBookingDetailTab("Overview");

    navigate("/form")

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /*
    Runs after Create Booking saves a new booking. The website inquiry is
    marked converted only when the form was opened from it AND the saved
    booking still records it as its source, so a different or reset form
    can never close an unrelated inquiry (AUDIT-004, AUDIT-044).
  */
  const handleBookingCreated = async (savedBooking) => {
    const guestSource = guestBookingSource;
    const decision = decideGuestInquiryConversion({
      guestSource,
      formSeedId: bookingFormSeed?.id,
      savedBooking,
    });

    setGuestBookingSource(null);
    setBookingFormSeed(null);

    if (savedBooking?.id) {
      setPublicInquiries((currentInquiries) => [
        ...currentInquiries.filter((inquiry) => inquiry.id !== savedBooking.id),
        savedBooking,
      ]);
    }

    const bookingName = savedBooking?.organizationName || "the group";

    if (decision.action === "none") {
      setBookingFormNotice({
        kind: "success",
        message: `Booking created for ${bookingName}.`,
      });
      return;
    }

    if (decision.action === "skip") {
      setBookingFormNotice({
        kind: "warning",
        message:
          `Booking created for ${bookingName}, but it no longer records the website inquiry from ` +
          `${guestSource.guestOrganizationName} as its source, so that inquiry was left open.`,
      });
      return;
    }

    try {
      await markGuestInquiryConverted(
        guestSource.guestInquiryId,
        savedBooking.id
      );

      setBookingFormNotice({
        kind: "success",
        message: `Booking created for ${bookingName}. The website inquiry was marked converted.`,
      });
    } catch (error) {
      console.error(
        "Booking saved, but guest inquiry could not be marked converted:",
        error
      );

      setBookingFormNotice({
        kind: "warning",
        message:
          `Booking created for ${bookingName}, but the website inquiry from ` +
          `${guestSource.guestOrganizationName} is still open: ${error?.message || "unknown error"}`,
        retry: {
          guestInquiryId: guestSource.guestInquiryId,
          bookingId: savedBooking.id,
          bookingName,
        },
      });
    }
  };

  const retryGuestInquiryConversion = async () => {
    const retry = bookingFormNotice?.retry;

    if (!retry) {
      return;
    }

    setIsRetryingConversion(true);

    try {
      await markGuestInquiryConverted(retry.guestInquiryId, retry.bookingId);
      setBookingFormNotice({
        kind: "success",
        message: `The website inquiry is now marked converted to ${retry.bookingName}.`,
      });
    } catch (error) {
      setBookingFormNotice({
        ...bookingFormNotice,
        message: `Still not marked: ${error?.message || "unknown error"}`,
      });
    } finally {
      setIsRetryingConversion(false);
    }
  };

  const startBookingFromGuestInquiry = ({
    bookingSeed,
    guestInquiryId,
    guestOrganizationName,
  }) => {
    setBookingFormSeed(
      bookingSeed
    );

    setGuestBookingSource({
      guestInquiryId,
      guestOrganizationName,
      seedId: bookingSeed?.id,
    });
    setBookingFormNotice(null);

    setSelectedBooking(null);

    setBookingDetailTab(
      "Overview"
    );

    navigate("/form");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };


  // Tutorial gnome anchors (src/tutorial/tutorials.js); add views as tutorials need them.
  const sidebarTutorialTargets = {
    "Calendar View": "nav-calendar",
    "Lodging Calendar": "nav-lodging-calendar",
    [SPREADSHEET_VIEW_NAME]: "nav-master-spreadsheet",
    [INQUIRY_SPREADSHEET_VIEW_NAME]: "nav-inquiry-spreadsheet",
    "Contacts View": "nav-contacts",
    Hosting: "nav-hosting",
    Reports: "nav-reports",
    Jobs: "nav-jobs",
    Backup: "nav-backup",
  };

  const sidebarItemLookup = Object.fromEntries(
    sidebarSections
      .flatMap((section) => section.items)
      .map((item) => [item.label, item])
  );

  const reorganizedSidebarSections = [
    {
      label: "Calendar",
      items: [
        {
          ...sidebarItemLookup["Calendar"],
          label: "Main Calendar",
          view: "Calendar View",
          icon:
            sidebarItemLookup["Calendar"]?.icon ||
            FaCalendarAlt,
        },
        {
          ...sidebarItemLookup["Lodging Calendar"],
          label: "Lodging Calendar",
          view: "Lodging Calendar",
          icon:
            sidebarItemLookup["Lodging Calendar"]?.icon ||
            FaBed,
        },
      ],
    },
    {
      label: "Spreadsheet",
      items: [
        {
          ...sidebarItemLookup["Master Spreadsheet"],
          label: "Master Spreadsheet",
          view: SPREADSHEET_VIEW_NAME,
          icon:
            sidebarItemLookup["Master Spreadsheet"]?.icon ||
            FaTable,
        },
        {
          ...sidebarItemLookup["Inquiry Spreadsheet"],
          label: "Inquiry Spreadsheet",
          view: INQUIRY_SPREADSHEET_VIEW_NAME,
          icon:
            sidebarItemLookup["Inquiry Spreadsheet"]?.icon ||
            FaClipboardList,
        },
        {
          ...sidebarItemLookup["Contacts"],
          label: "Contacts",
          view: "Contacts View",
          icon:
            sidebarItemLookup["Contacts"]?.icon ||
            FaUsers,
        },
      ],
    },
    {
      label: "Internal",
      items: [
        {
          label: "Hosting",
          view: "Hosting",
          icon: FaConciergeBell,
        },
      ],
    },
    {
      label: "Reporting",
      items: [
        {
          ...sidebarItemLookup["Reports"],
          label: "Reports",
          view: "Reports",
          icon:
            sidebarItemLookup["Reports"]?.icon ||
            FaChartBar,
        },
      ],
    },
    {
  label: "Other",
    items: [
      {
        ...sidebarItemLookup["User Admin"],
        label: "User Admin",
        view: "User Admin",
        icon:
          sidebarItemLookup["User Admin"]?.icon ||
          FaUserShield,
      },
      {
        ...sidebarItemLookup["Jobs"],
        label: "Jobs",
        view: "Jobs",
        icon:
          sidebarItemLookup["Jobs"]?.icon ||
          FaClipboardList,
      },
      {
        label: "Backup",
        view: "Backup",
        icon: FaShieldAlt,
      },
    ],
  },
  ];


  const currentNavLabel =
    { "Portal View": "Portals" }[activeView] ||
    reorganizedSidebarSections
      .flatMap((section) => section.items)
      .find((item) => (item.view || item.label) === activeView)?.label ||
    activeView;

  return (
    <main
      className={`dashboard-shell ${
        isRailCollapsed ? "dashboard-shell-sidebar-collapsed" : ""
      }`}
    >
      {/* Phones and tablets only (CSS). data-tutorial-ui: the menu must open during a tutorial. */}
      <header className="mobile-app-header" inert={isNavDrawerShown}>
        <button
          ref={navMenuButtonRef}
          className="mobile-app-menu-button"
          type="button"
          aria-label="Open menu"
          aria-expanded={isNavDrawerShown}
          aria-controls="dashboard-navigation"
          data-tutorial-ui
          data-tutorial-target="nav-menu"
          onClick={() => setIsNavDrawerOpen(true)}
        >
          <FaBars aria-hidden="true" />
        </button>

        <span className="mobile-app-header-mark" aria-hidden="true"><img src="/favicon.svg" alt="" /></span>
        <strong className="mobile-app-header-title">{currentNavLabel}</strong>
      </header>

      {isNavDrawerShown && (
        <button
          className="dashboard-nav-backdrop"
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          data-tutorial-ui
          onClick={() => setIsNavDrawerOpen(false)}
        />
      )}

      <aside
        id="dashboard-navigation"
        aria-label="Main navigation"
        className={`dashboard-sidebar ${
          isRailCollapsed ? "dashboard-sidebar-collapsed" : ""
        } ${isNavDrawerShown ? "dashboard-sidebar-open" : ""}`}
        onClick={(event) => {
          // Choosing a page closes the drawer, even when it is the page already open.
          if (event.target.closest(".sidebar-link")) setIsNavDrawerOpen(false);
        }}
      >
        <div className="dashboard-logo">
          <span aria-hidden="true"><img src="/favicon.svg" alt="" /></span>

          <div>
            <strong>Toah Nipi</strong>
            <small>Staff Dashboard</small>
          </div>

          <button
            ref={navDrawerCloseRef}
            className="sidebar-close-button"
            type="button"
            aria-label="Close menu"
            data-tutorial-ui
            onClick={() => setIsNavDrawerOpen(false)}
          >
            <FaTimes aria-hidden="true" />
          </button>

          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </button>
        </div>

        <div className="dashboard-sidebar-signout">
          <StaffSignOutButton />
        </div>

        <div className="dashboard-sidebar-theme">
          <ThemeToggle />
        </div>

        <div className="sidebar-section sidebar-main-section">
          <p>Main</p>

          <button
            className={`sidebar-link ${
              activeView === "Dashboard" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Dashboard"
            onClick={() => {
              setSelectedBooking(null);
              setBookingDetailTab("Overview");
              navigate("/dashboard")
            }}
          >
            <FaHome />
            <span>Dashboard</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Form" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Form"
            data-tutorial-target="nav-form"
            onClick={() => {
              setSelectedBooking(null);
              setBookingFormSeed(null);
              setGuestBookingSource(null);
              setBookingFormNotice(null);
              setBookingDetailTab("Overview");
              navigate("/form")
            }}
          >
            <FaClipboardList />
            <span>Form</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Portal View" ? "sidebar-link-active" : ""
            }`}
            type="button"
            title="Portals"
            data-tutorial-target="nav-portals"
            onClick={() => {
              setSelectedBooking(null);
              setBookingDetailTab("Overview");
              navigate("/portal-admin")
            }}
          >
            <FaKey />
            <span>Portals</span>
          </button>

          <button
            className={`sidebar-link ${
              activeView === "Guest Inquiries"
                ? "sidebar-link-active"
                : ""
            }`}
            type="button"
            title="Guest Inquiries"
            data-tutorial-target="nav-guest-inquiries"
            onClick={() => {
              setSelectedBooking(null);

              setBookingDetailTab(
                "Overview"
              );

              handleActiveViewChange(
                "Guest Inquiries"
              );
            }}
          >
            <FaEnvelopeOpenText />

            <span>
              Guest Inquiries
            </span>
          </button>
        </div>

        {reorganizedSidebarSections.map((section) => (
          <div
            className="sidebar-section"
            key={section.label}
          >
            <p>{section.label}</p>

            {section.items.map((item) => {
              const Icon = item.icon;

              const targetView =
                item.view || item.label;

              return (
                <button
                  className={`sidebar-link ${
                    activeView === targetView
                      ? "sidebar-link-active"
                      : ""
                  }`}
                  key={item.label}
                  type="button"
                  title={item.label}
                  data-tutorial-target={sidebarTutorialTargets[targetView]}
                  onClick={() => {
                    setSelectedBooking(null);

                    setBookingDetailTab(
                      "Overview"
                    );

                    handleActiveViewChange(
                      targetView
                    );
                  }}
                >
                  <Icon />

                  <span>
                    {item.label}
                  </span>

                  {item.hasBadge &&
                    inquiryPipelineNeedsReviewCount > 0 && (
                      <strong className="sidebar-badge">
                        {item.label ===
                        "Inquiry Pipeline"
                          ? inquiryPipelineNeedsReviewCount
                          : inquiryBookings.length}
                      </strong>
                    )}
                </button>
              );
            })}
          </div>
        ))}

        <div className="sidebar-section">
          <p>Staff</p>
          <button
            className="sidebar-link"
            type="button"
            title="Staff app"
            onClick={() => navigate("/staff")}
          >
            <FaConciergeBell />
            <span>Staff app</span>
          </button>
        </div>
      </aside>

      <section className="dashboard-main" inert={isNavDrawerShown}>

        {activeView !== "Form" && (
          <>
            <DashboardTopbar
              activeView={activeView}
              masterFileInputRef={masterFileInputRef}
              staffContactsFileInputRef={staffContactsFileInputRef}
              master2026FileInputRef={master2026FileInputRef}
              master2027FileInputRef={master2027FileInputRef}
              importEverythingFileInputRef={importEverythingFileInputRef}
              importDropdownRef={importDropdownRef}
              isImportMenuOpen={isImportMenuOpen}
              setIsImportMenuOpen={setIsImportMenuOpen}
              isDevMode={isDevMode}
              setIsDevMode={setIsDevMode}
              handleImportMasterSpreadsheet={handleImportMasterSpreadsheet}
              handleImportMaster2026Spreadsheet={handleImportMaster2026Spreadsheet}
              handleImportMaster2027Spreadsheet={handleImportMaster2027Spreadsheet}
              handleImportEverythingSpreadsheet={handleImportEverythingSpreadsheet}
              openMasterImportPicker={openMasterImportPicker}
              openMaster2026ImportPicker={openMaster2026ImportPicker}
              openMaster2027ImportPicker={openMaster2027ImportPicker}
              openEverythingImportPicker={openEverythingImportPicker}
              exportInquiriesToSpreadsheet={exportInquiriesToSpreadsheet}
              refreshInquiries={refreshInquiries}
                            deleteAllInquiries={
                canDeleteBookings ? deleteAllInquiries : undefined
              }
              canImport={!isViewOnlyAccount}
              handleImportStaffContactsSpreadsheet={handleImportStaffContactsSpreadsheet}
              openStaffContactsImportPicker={openStaffContactsImportPicker}
            />


          </>
        )}

        {activeView === SPREADSHEET_VIEW_NAME && isSpreadsheetRevealLoading && (
          <SpreadsheetViewLoadingScreen rowCount={inquiryBookings.length} />
        )}


        {hasOpenedSpreadsheetView && (
          <section
            className={`dashboard-keepalive-view ${
              activeView === SPREADSHEET_VIEW_NAME && !isSpreadsheetRevealLoading
                ? "dashboard-keepalive-view-active"
                : ""
            }`}
            aria-hidden={
              activeView !== SPREADSHEET_VIEW_NAME || isSpreadsheetRevealLoading
            }
          >
            <SpreadsheetView
              inquiryBookings={inquiryBookings}
              openBookingDetail={openBookingDetail}
              isLoading={false}
            />
          </section>
        )}


        {keptCalendarView === "Calendar View" && (
          <section
            className={`dashboard-keepalive-view ${
              activeView === "Calendar View"
                ? "dashboard-keepalive-view-active"
                : ""
            }`}
            aria-hidden={activeView !== "Calendar View"}
          >
            <CalendarView
              calendarCells={calendarCells}
              datedInquiries={datedInquiries}
              selectedMonthInquiries={selectedMonthInquiries}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              setSelectedMonth={setSelectedMonth}
              setSelectedYear={setSelectedYear}
              goToCurrentMonth={goToCurrentMonth}
              goToPreviousMonth={goToPreviousMonth}
              goToNextMonth={goToNextMonth}
              getCalendarEventColor={getCalendarEventColor}
              onOpenBooking={openCalendarBooking}
            />
          </section>
        )}


        {keptCalendarView === "Lodging Calendar" && (
          <section
            className={`dashboard-keepalive-view ${
              activeView === "Lodging Calendar"
                ? "dashboard-keepalive-view-active"
                : ""
            }`}
            aria-hidden={activeView !== "Lodging Calendar"}
          >
            <LodgingCalendarView
              hiddenOccupancy={datedHostingRecords}
              calendarCells={calendarCells}
              datedInquiries={datedInquiries}
              selectedMonthInquiries={selectedMonthInquiries}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              setSelectedMonth={setSelectedMonth}
              setSelectedYear={setSelectedYear}
              goToCurrentMonth={goToCurrentMonth}
              goToPreviousMonth={goToPreviousMonth}
              goToNextMonth={goToNextMonth}
              getCalendarEventColor={getCalendarEventColor}
              onOpenBooking={openCalendarBooking}
            />
          </section>
        )}


        {keptCalendarView === "Reports" && (
          <section
            className={`dashboard-keepalive-view ${
              activeView === "Reports"
                ? "dashboard-keepalive-view-active"
                : ""
            }`}
            aria-hidden={activeView !== "Reports"}
          >
            <SeasonReportsView
              // Report builders leave hosting out themselves and say how many (countsInReports).
              inquiryBookings={allBookingRecords}
              isLoading={isBookingsLoading}
              loadError={bookingsLoadError}
              loadedAt={bookingsLoadedAt}
              onRetry={loadBookingsFromSupabase}
              onOpenBooking={openCalendarBooking}
            />
          </section>
        )}


        {activeView === "Form" ? (
          <section className="dashboard-form-view">
            {bookingFormNotice && (
              <div
                className={`booking-form-notice is-${bookingFormNotice.kind}`}
                role={bookingFormNotice.kind === "warning" ? "alert" : "status"}
              >
                <p>{bookingFormNotice.message}</p>

                <div className="booking-form-notice-actions">
                  {bookingFormNotice.retry && (
                    <button
                      className="primary-dashboard-button"
                      type="button"
                      disabled={isRetryingConversion}
                      onClick={retryGuestInquiryConversion}
                    >
                      {isRetryingConversion ? "Retrying…" : "Retry marking the inquiry"}
                    </button>
                  )}

                  <button
                    className="secondary-dashboard-button"
                    type="button"
                    onClick={() => setBookingFormNotice(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <CreateBooking
              key={
                bookingFormSeed?.id ||
                "blank-booking-form"
              }
                            initialInquiry={bookingFormSeed}
              isDevMode={isDevMode}
              staffUsers={staffUsers}
              occupancyRecords={allBookingRecords}
              onBookingCreated={handleBookingCreated}
            />
          </section>
        ) : activeView === "Inquiry Record Detail" ? (
          <InquiryRecordDetailView
            booking={selectedBooking}
            onSaveBooking={saveBookingEdits}
            onBack={closeBookingDetail}
          />
        ) : activeView === "Hosting Detail" ? (
          <HostingDetailView
            key={selectedBooking?.id || "new-hosting"}
            record={selectedBooking}
            occupancyRecords={allBookingRecords}
            onSave={saveBookingEdits}
            onDelete={canDeleteBookings ? deleteSingleBooking : undefined}
            onConvertToBooking={(record) => convertRecord(record, false)}
            onOpenRecord={openRecordFromDetail}
            onBack={closeBookingDetail}
          />
        ) : activeView === "Hosting" ? (
          <HostingView
            hostingRecords={hostingRecords}
            guestBookings={inquiryBookings}
            calendarProps={{
              calendarCells,
              selectedMonth,
              selectedYear,
              setSelectedMonth,
              setSelectedYear,
              goToCurrentMonth,
              goToPreviousMonth,
              goToNextMonth,
              getCalendarEventColor,
            }}
            onOpenRecord={(record) => openBookingDetail(record, "Hosting")}
            onOpenRecordById={openCalendarBooking}
            onAddHosting={() => openHostingDetail(null, "Hosting")}
          />
        ) : activeView === "Booking Detail" ? (
          <BookingDetailView
            booking={selectedBooking}
            occupancyRecords={allBookingRecords}
            onOpenRecord={openRecordFromDetail}
            onConvertToHosting={isViewOnlyAccount ? undefined : (record) => convertRecord(record, true)}
            onCreatePortalLink={isViewOnlyAccount ? undefined : createPortalLinkForBooking}
            activeTab={bookingDetailTab}
            setActiveTab={setBookingDetailTab}
            onSaveBooking={saveBookingEdits}
                        onDeleteBooking={deleteSingleBooking}
            canDeleteBookings={canDeleteBookings}
            staffUsers={staffUsers}
            currentStaffUserId={currentStaffUserId}
            onBack={closeBookingDetail}
          />
        ) : activeView === "Calendar View" ||
          activeView === "Lodging Calendar" ||
          activeView === "Reports" ||
          activeView === SPREADSHEET_VIEW_NAME ? null : activeView === INQUIRY_SPREADSHEET_VIEW_NAME ? (
                <InquirySpreadsheetView
                  inquiryBookings={inquiryBookings}
                  openBookingDetail={openInquiryRecordDetail}
                  openConvertedBooking={openBookingDetail}
                  startBookingFromInquiry={
                    startBookingFromInquiry
                  }
                />
              ) : activeView === "Contacts View" ? (
                    // Secondary contacts are part of the main list now (AUDIT-039).
          <ContactsView
            inquiryBookings={allBookingRecords}
            openBookingDetail={openBookingDetail}
            canEditGroups={!isViewOnlyAccount}
          />
        ) : activeView === "Inquiry Pipeline" && !isDevMode ? (
          /*
            Retired (Q-011): the code is kept for reference, but staff cannot
            open it, including through the /inquiry-pipeline address. It only
            renders with Dev Mode on. Booking progress lives in Portal Admin.
          */
          <section className="dashboard-card empty-state">
            <strong>The Inquiry Pipeline has been retired</strong>
            <p>
              Booking progress such as contracts, deposits and insurance is
              tracked in Portal Admin. Inquiries are listed in the Inquiry
              Spreadsheet and Guest Inquiries.
            </p>
          </section>
        ) : activeView === "Inquiry Pipeline" ? (
          <InquiryPipelineView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openInquiryRecordDetail}
            onUpdateBookingStatus={(booking, nextStatus) =>
              saveBookingEdits({
                ...booking,
                status: nextStatus,
                waitlist:
                  nextStatus === "Waitlist"
                    ? "Yes"
                    : booking.waitlist,
              })
            }
          />

        ) : activeView === "Guest Inquiries" ? (
          <GuestInquiriesView
            onCreateBooking={
              startBookingFromGuestInquiry
            }
            existingBookings={inquiryBookings}
          />

        ) : activeView === "Backup" ? (
                    <DashboardBackups
            isDevMode={isDevMode}
            canReplace={canDeleteBookings}
            canRestore={!isViewOnlyAccount}
            onRestoreComplete={() => {
              loadBookingsFromSupabase();
            }}
          />

        ) : activeView === "Portal View" ? (
          <PortalAdminView
            inquiryBookings={inquiryBookings}
            openBookingDetail={openBookingDetail}
            staffRole={staffRole}
          />
        ) : activeView === "User Admin" ? (
                    <UserAdminView
            staffUsers={staffUsers}
            setStaffUsers={setStaffUsers}
            currentStaffUserId={currentStaffUserId}
            setCurrentStaffUserId={setCurrentStaffUserId}
            staffDirectoryStatus={staffDirectoryStatus}
            unlistedStaffNames={unlistedStaffNames}
            isAdmin={staffRole === "admin"}
            onCopyBrowserListToShared={
              getSavedStaffUsers().length > 0
                ? copyBrowserStaffListToSharedDirectory
                : undefined
            }
          />
        ) : activeView === "Jobs" ? (
                    <JobsView
            inquiryBookings={inquiryBookings}
            staffUsers={staffUsers}
            currentStaffUserId={currentStaffUserId}
            openBookingDetail={openBookingDetail}
            onSaveBooking={saveBookingEdits}
          />
        ) : (
          <section className="home-dashboard-page">
            <header className="home-dashboard-hero">
              <div className="home-dashboard-hero-copy">
                <span className="home-dashboard-eyebrow">
                  {dashboardTodayLabel}
                </span>

                <h1>
                  {dashboardGreeting}
                  {dashboardCurrentStaffUser?.name
                    ? `, ${dashboardCurrentStaffUser.name}`
                    : ""}
                  .
                </h1>

                <p>
                  Here is what is happening at camp, what is coming next,
                  and what needs staff attention.
                </p>
              </div>

              <div className="home-dashboard-hero-actions">
                <button
                  className="home-dashboard-primary-action"
                  type="button"
                  onClick={() => {
                    setSelectedBooking(null);
                    setBookingFormSeed(null);
                    setGuestBookingSource(null);
                    setBookingFormNotice(null);
                    setBookingDetailTab(
                      "Overview"
                    );
                    navigate("/form");
                  }}
                >
                  <FaPlus />
                  New Booking
                </button>

                <button
                  className="home-dashboard-secondary-action"
                  type="button"
                  onClick={() =>
                    handleActiveViewChange(
                      "Calendar View"
                    )
                  }
                >
                  <FaCalendarAlt />
                  Open Calendar
                </button>

                <button
                  className={`dev-mode-toggle home-dashboard-toggle ${
                    isDashboardQuickActionsVisible ? "is-on" : ""
                  }`}
                  type="button"
                  role="switch"
                  aria-checked={isDashboardQuickActionsVisible}
                  onClick={toggleDashboardQuickActions}
                >
                  <span className="dev-mode-toggle-track" aria-hidden="true">
                    <span className="dev-mode-toggle-thumb" />
                  </span>
                  Quick Actions
                </button>
              </div>
            </header>

            <section className="home-dashboard-metrics">
              <article className="home-dashboard-metric home-dashboard-metric-green">
                <span className="home-dashboard-metric-icon">
                  <FaHome />
                </span>

                <div>
                  <span>On Site Today</span>
                  <strong>
                    {dashboardBookingsToday.length}
                  </strong>
                  <p>
                    {dashboardGuestsToday} recorded guest
                    {dashboardGuestsToday === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-blue">
                <span className="home-dashboard-metric-icon">
                  <FaSignInAlt />
                </span>

                <div>
                  <span>Arriving Next 7 Days</span>
                  <strong>
                    {dashboardArrivalsNextSevenDays.length}
                  </strong>
                  <p>
                    Scheduled group
                    {dashboardArrivalsNextSevenDays.length === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-gold">
                <span className="home-dashboard-metric-icon">
                  <FaExclamationTriangle />
                </span>

                <div>
                  <span>Needs Attention</span>
                  <strong>
                    {dashboardAttentionTotal}
                  </strong>
                  <p>
                    Across {dashboardVisibleAttentionItems.length} action categor
                    {dashboardVisibleAttentionItems.length === 1
                      ? "y"
                      : "ies"}
                  </p>
                </div>
              </article>

              <article className="home-dashboard-metric home-dashboard-metric-purple">
                <span className="home-dashboard-metric-icon">
                  <FaUsers />
                </span>

                <div>
                  <span>{dashboardPeriodTitle}</span>
                  <strong>
                    {dashboardUpcomingPeriod.length}
                  </strong>
                  <p>
                    {dashboardUpcomingPeriodGuests} expected guest
                    {dashboardUpcomingPeriodGuests === 1
                      ? ""
                      : "s"}
                  </p>
                  <p className="home-dashboard-metric-range">
                    {formatDashboardPeriodRange(
                      dashboardToday,
                      dashboardPeriodEnd
                    )}
                  </p>
                </div>

                <button
                  className="home-dashboard-metric-settings"
                  type="button"
                  title="Change time period"
                  aria-label={`Change time period, currently ${dashboardPeriodTitle}`}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setIsDashboardPeriodDialogOpen(true)
                  }
                >
                  <FaCog />
                </button>
              </article>
            </section>

            {isDashboardPeriodDialogOpen && (
              <DashboardPeriodDialog
                period={dashboardSummaryPeriod}
                start={dashboardToday}
                onSave={saveDashboardSummaryPeriod}
                onClose={() =>
                  setIsDashboardPeriodDialogOpen(false)
                }
              />
            )}

            <section
              className={`home-dashboard-main-grid ${
                isDashboardQuickActionsVisible
                  ? ""
                  : "home-dashboard-main-grid-stacked"
              }`}
            >
              <div className="home-dashboard-column">
                <article className="home-dashboard-card">
                  <header className="home-dashboard-card-header home-dashboard-card-header-with-action">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-blue">
                        <FaSignInAlt />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Next 7 Days
                        </span>
                        <h2>Arrivals &amp; On Site</h2>

                      </div>
                    </div>

                    <div className="home-dashboard-header-actions">
                      <button
                        className="home-dashboard-text-action"
                        type="button"
                        onClick={() =>
                          handleActiveViewChange(
                            "Calendar View"
                          )
                        }
                      >
                        View calendar
                        <FaChevronRight />
                      </button>

                      <button
                        className="home-dashboard-text-action"
                        type="button"
                        onClick={() =>
                          handleActiveViewChange(
                            "Lodging Calendar"
                          )
                        }
                      >
                        Check lodging
                        <FaChevronRight />
                      </button>
                    </div>
                  </header>

                  {dashboardWeekDays.some(
                    (day) =>
                      day.arrivals.length > 0 ||
                      day.onSite.length > 0
                  ) ? (
                    <div className="home-dashboard-schedule">
                      {dashboardWeekDays.map((day) => {
                        const isToday =
                          isDashboardHomeSameDay(
                            day.date,
                            dashboardToday
                          );

                        return (
                          <section
                            className={`home-dashboard-schedule-day ${
                              isToday
                                ? "home-dashboard-schedule-day-today"
                                : ""
                            }`}
                            key={day.date.toISOString()}
                          >
                            <div className="home-dashboard-schedule-day-heading">
                              <h3>
                                <DashboardHomeDate date={day.date} />
                              </h3>

                              {isToday && <small>Today</small>}

                              <div className="home-dashboard-schedule-day-stats">
                                <span>
                                  <FaSignInAlt />
                                  {day.arrivals.length} arrival
                                  {day.arrivals.length === 1 ? "" : "s"}
                                </span>

                                <span>
                                  <FaHome />
                                  {day.onSite.length} on site
                                </span>

                                <span>
                                  <FaUsers />
                                  {day.guests} recorded guest
                                  {day.guests === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>

                            {day.onSite.length + day.arrivals.length > 0 && (
                              <div className="home-dashboard-schedule-card">
                                {[...day.arrivals, ...day.staying].map(
                                  (booking) => (
                                    <DashboardHomeScheduleRow
                                      booking={booking}
                                      isArrival={day.arrivals.includes(booking)}
                                      onOpen={openBookingDetail}
                                      key={booking.id}
                                    />
                                  )
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="home-dashboard-empty-state">
                      <FaCalendarAlt />
                      <strong>
                        No arrivals or groups on site in the next 7 days
                      </strong>
                      <p>
                        Future groups will appear here automatically once they have dates.
                      </p>
                    </div>
                  )}
                </article>
              </div>

              <aside className="home-dashboard-column">
                <article className="home-dashboard-card home-dashboard-today-card">
                  <header className="home-dashboard-card-header home-dashboard-card-header-with-action">
                    <div className="home-dashboard-card-heading">
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-green">
                        <FaHome />
                      </span>

                      <div>
                        <span className="home-dashboard-section-label">
                          Live Snapshot
                        </span>
                        <h2>Today at Camp</h2>
                        <p>
                          Groups whose stay includes today.
                        </p>
                      </div>
                    </div>
                  </header>

                  {dashboardBookingsToday.length > 0 ? (
                    <div className="home-dashboard-today-list">
                      {dashboardBookingsToday
                        .slice(0, 5)
                        .map((booking) => {
                          const guestCount =
                            getDashboardHomeGuestCount(
                              booking
                            );

                          return (
                            <button
                              className="home-dashboard-today-row"
                              type="button"
                              key={booking.id}
                              onClick={() =>
                                openBookingDetail(
                                  booking
                                )
                              }
                            >
                              <span className="home-dashboard-today-dot" />

                              <span className="home-dashboard-today-copy">
                                <strong>
                                  {booking.organizationName ||
                                    "Unnamed Organization"}
                                </strong>
                                <small>
                                  {getDashboardHomeHousingLabel(
                                    booking
                                  )}
                                </small>
                              </span>

                              <span className="home-dashboard-today-guests">
                                {guestCount > 0
                                  ? `${guestCount} guest${
                                      guestCount === 1
                                        ? ""
                                        : "s"
                                    }`
                                  : "Guests —"}
                              </span>
                            </button>
                          );
                        })}

                      {dashboardBookingsToday.length > 5 && (
                        <button
                          className="home-dashboard-more-button"
                          type="button"
                          onClick={() =>
                            handleActiveViewChange(
                              "Calendar View"
                            )
                          }
                        >
                          +{dashboardBookingsToday.length - 5} more group
                          {dashboardBookingsToday.length - 5 === 1
                            ? ""
                            : "s"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="home-dashboard-empty-state home-dashboard-empty-state-compact">
                      <FaHome />
                      <strong>
                        No groups are scheduled on site today
                      </strong>
                      <p>
                        Arrivals in the next 7 days appear under Arrivals &amp; On Site.
                      </p>
                    </div>
                  )}
                </article>

                {isDashboardQuickActionsVisible && (
                  <article className="home-dashboard-card">
                    <header className="home-dashboard-card-header">
                      <div className="home-dashboard-card-heading">
                        <span className="home-dashboard-card-icon home-dashboard-card-icon-purple">
                          <FaClock />
                        </span>
  
                        <div>
                          <span className="home-dashboard-section-label">
                            Shortcuts
                          </span>
                          <h2>Quick Actions</h2>
                          <p>
                            Jump directly into common staff workflows.
                          </p>
                        </div>
                      </div>
                    </header>
  
                    <div className="home-dashboard-quick-actions">
                      {dashboardQuickActions.map(
                        (action) => {
                          const Icon = action.icon;
  
                          return (
                            <button
                              className="home-dashboard-quick-action"
                              type="button"
                              key={action.label}
                              onClick={() => {
                                if (
                                  action.view ===
                                  "Form"
                                ) {
                                  setSelectedBooking(
                                    null
                                  );
                                  setBookingFormSeed(
                                    null
                                  );
                                  setGuestBookingSource(
                                    null
                                  );
                                  setBookingDetailTab(
                                    "Overview"
                                  );
                                  navigate("/form");
                                  return;
                                }
  
                                handleActiveViewChange(
                                  action.view
                                );
                              }}
                            >
                              <span>
                                <Icon />
                              </span>
  
                              <div>
                                <strong>
                                  {action.label}
                                </strong>
                                <small>
                                  {action.description}
                                </small>
                              </div>
  
                              <FaChevronRight />
                            </button>
                          );
                        }
                      )}
                    </div>
                  </article>
                )}

                <article className="home-dashboard-card">
                  <h2 className="home-dashboard-collapse-title">
                    <button
                      className="home-dashboard-card-heading home-dashboard-collapse-toggle"
                      type="button"
                      aria-expanded={isDashboardActionCenterExpanded}
                      aria-controls="dashboard-action-center-panel"
                      onClick={toggleDashboardActionCenter}
                    >
                      <span className="home-dashboard-card-icon home-dashboard-card-icon-gold">
                        <FaExclamationTriangle />
                      </span>

                      <span className="home-dashboard-collapse-copy">
                        <span className="home-dashboard-section-label">
                          Staff Focus
                        </span>
                        <strong>Action Center</strong>
                        <small>
                          {dashboardAttentionTotal === 0
                            ? "Nothing needs attention"
                            : dashboardAttentionTotal === 1
                            ? "1 item needs attention"
                            : `${dashboardAttentionTotal} items need attention`}
                        </small>
                      </span>

                      <FaChevronDown className="home-dashboard-collapse-chevron" />
                    </button>
                  </h2>

                  <div
                    id="dashboard-action-center-panel"
                    hidden={!isDashboardActionCenterExpanded}
                  >
                    <p className="home-dashboard-collapse-description">
                      The booking records most likely to need follow-up.
                    </p>

                    {dashboardVisibleAttentionItems.length > 0 ? (
                      <div className="home-dashboard-attention-list">
                        {dashboardVisibleAttentionItems.map(
                          (item) => {
                            const Icon = item.icon;

                            return (
                              <button
                                className={`home-dashboard-attention-item home-dashboard-attention-${item.tone}`}
                                type="button"
                                key={item.id}
                                onClick={() =>
                                  handleActiveViewChange(
                                    item.view
                                  )
                                }
                              >
                                <span className="home-dashboard-attention-icon">
                                  <Icon />
                                </span>

                                <span className="home-dashboard-attention-copy">
                                  <strong>
                                    {item.title}
                                  </strong>
                                  <small>
                                    {item.description}
                                  </small>
                                </span>

                                <span className="home-dashboard-attention-count">
                                  {item.count}
                                </span>

                                <FaChevronRight className="home-dashboard-attention-arrow" />
                              </button>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <div className="home-dashboard-all-clear">
                        <span>
                          <FaRegCalendarCheck />
                        </span>

                        <div>
                          <strong>
                            Nothing urgent is showing right now
                          </strong>
                          <p>
                            Upcoming booking records have dates, housing,
                            guest counts, and no outstanding contract flags.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              </aside>
            </section>
          </section>
        )}



      </section>
    </main>
  );
}
